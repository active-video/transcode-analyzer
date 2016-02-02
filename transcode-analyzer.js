module.exports = function () {

    var FindFiles = require("node-find-files"),
        FileQueue = require('filequeue'),
        fq = new FileQueue(100);
        fs = require('fs'),
        status = require('node-status'),
        console = console,
        Promise = require('promise'),
        json2csv = require('json2csv'),
        dateFormat = require('dateformat');


    /**
     * An Analyzer is responsible for processing a single directory recursively,
     * they can be run in parallel
     * @param src
     * @param output
     * @param verbose
     * @constructor
     */
    function Analyzer(src, output, verbose){
        this.constructor.apply(this, arguments);
    }

    Analyzer.prototype = {
        verbose: false,
        ready: 0,
        src: null,
        output: null,
        outputStream: null,
        finder: null,
        found: 0,
        processed: 0,
        stats: null,
        timeStampStart: /([0-9]{4,4}\-[0-9]{2,2}\-[0-9]{2,2}T[0-9]{2,2}\:[0-9]{2,2}\:[0-9]{2,2}\.[0-9]+\-[0-9]{2,2}\:[0-9]{2,2}).*muxrate VBR/,
        timeStampEnd: /([0-9]{4,4}\-[0-9]{2,2}\-[0-9]{2,2}T[0-9]{2,2}\:[0-9]{2,2}\:[0-9]{2,2}\.[0-9]+\-[0-9]{2,2}\:[0-9]{2,2}).*session_cleanup starting/,

        promise: null,
        resolve: null,
        reject: null,

        constructor: function(src, output, verbose){
            this.src = src;
            this.output = output;
            this.verbose = verbose;
            this.stats = {
                video: [],
                audio: []
            };

            this.initLog();

            //@TODO check validity of args
            console.log("Starting search through: " + src);
            this.promise = new Promise(this.deferred.bind(this));

            this.finder = new FindFiles({
                rootFolder: src,
                filterFunction: this.checkIsMatchedFile.bind(this)
            });

            this.finder.on("match", this.processFile.bind(this));
            this.finder.on("complete", function() {
                console.log("Found " + this.found + " logs, processing...");
            });

            this.finder.on("patherror", function(err, strPath) {
                console.log("Error for Path " + strPath + " " + err);  // Note that an error in accessing a particular file does not stop the whole show
            });

            this.finder.on("error", function(err) {
                console.log("Global Error " + err);
            });


            this.finder.startSearch();
        },

        checkIsMatchedFile: function(path, stat) {
            var parts = path.split('/');
            //console.log(parts[parts.length-1]);
            if (parts[parts.length - 1] === 'transcoder_core.txt') {
                return true;
            } else {
                return false;
            }
        },

        deferred: function(resolve, reject){
            this.resolve = resolve;
            this.reject = reject;
        },


        processFile: function(strPath, stat) {
            this.found++;

            var contents = {
                log: false,
                index: false,
                logFile: strPath,
                indexFile: strPath.replace('transcoder_core.txt', 'index.xml')
            };

            fq.readFile(contents.logFile, {encoding: 'utf8'}, this.onComplete.bind(this, 'log', contents));
            fq.readFile(contents.indexFile, {encoding: 'utf8'}, this.onComplete.bind(this, 'index', contents));
        },

        initLog: function(){
            this.statusComplete =status.addItem("Complete", {
                type: ['bar', 'percentage'],
                max: 100
            });

            status.addItem("Transcodes Found", {
                type: [this.getFoundCount.bind(this)]
            });

            status.addItem("Transcodes Processed", {
                type: [this.getProcessedCount.bind(this)]
            });



            status.start();
            console = status.console();
        },

        onComplete: function(type, contents, err, data){
            //console.log('onComplete', type, data);

            if (err){
                contents[type] = -1;
                console.error("Could not read " + err);
            } else {
                contents[type] = data;
                //console.log(contents);
            }

            if(!contents.log || !contents.index) {
                return;
            }

            this.extractTimes(contents);
        },

        extractTimes: function(contents) {
            //"size": "0x0" ---> audio only

            if(contents.log !== -1 && contents.index !== -1) {
                var type = contents.log.indexOf('Can\'t find usable video stream') !== -1 ? 'audio' : 'video';

                var startLineMatches = contents.log.match(this.timeStampStart);
                var startTime = startLineMatches && startLineMatches.length > 1 ? startLineMatches[1] : false;

                var srcMatches = contents.log.match(/url\=(.*)\,verifyp/);
                var src = srcMatches && srcMatches.length > 1 ? srcMatches[1] : false;

                var endLineMatches = contents.log.match(this.timeStampEnd);
                var endTime = endLineMatches && endLineMatches.length > 1 ? endLineMatches[1] : false;

                var durationMatch = contents.index.match(/duration\=\"([0-9\.]+)/);
                var duration = durationMatch && durationMatch.length > 1 ? parseFloat(durationMatch[1])*1000 : false;

                if(duration !== false && startTime !== false && endTime !== false) {
                    var s = new Date(startTime);
                    var e = new Date(endTime);
                    var transcodeTime = e.getTime() - s.getTime();

                    var startTimeExcel = dateFormat(s, 'yyyy/mm/dd h:MM:ss TT');
                    var endTimeExcel = dateFormat(e, 'yyyy/mm/dd h:MM:ss TT');

                    this.stats[type].push({
                        "Start Time": startTime,
                        "Start Time Formatted": startTimeExcel,
                        "End Time": endTime,
                        "End Time Formatted": endTimeExcel,
                        "Transode Time (ms)": transcodeTime,
                        "Video Duration": duration,
                        "Delay from Realtime (transcodeTime/duration < 1 = realtime)": transcodeTime/duration,
                        "Delay from Realtime (duration - transcodeTime in seconds, negative is good)": transcodeTime - duration,
                        "Media URL": src
                    });
                    //console.log('duration: ', type, duration, transcodeTime, startTime, endTime, src);
                }


            }

            this.processed++;
            this.statusComplete.count = this.getPercentComplete();

            if(this.processed == this.found) {
                this.sortResults();
                this.logResults();
            }
        },

        sortResults: function(){
            this.stats.video.sort(this.sort);
            this.stats.audio.sort(this.sort);
        },

        logResults: function(){
            console.log('Converting results to CSV for output...\n');
            var name, completed = 0, needed = 0, csv;
            for(var type in this.stats) {
                needed++;
                json2csv({data: this.stats[type]}, function(type, err, csv){
                    completed++;
                    name = this.output + '.' + type + '.csv';

                    fs.writeFileSync(name, csv);
                    console.log('wrote ' + this.stats[type].length + ' ' + type + ' stats to ' + name + '\n');

                    if(completed == needed) {
                        this.resolve(this.stats);
                    }
                }.bind(this, type));
            }
        },

        sort: function(a, b){
            var aTime = new Date(a['Start Time']).getTime(),
                bTime = new Date(b['Start Time']).getTime();

            if(aTime < bTime) {
                return -1;
            } else if(aTime == bTime) {
                return 0;
            } else {
                return 1;
            }
        },

        getFoundCount: function(){
            return this.found;
        },

        getProcessedCount: function(){
            return this.processed;
        },

        getPercentComplete: function(){
            return this.getProcessedCount()/this.getFoundCount()*100;
        }
    };




    return new Analyzer(arguments[0], arguments[1], arguments[2]);
};
