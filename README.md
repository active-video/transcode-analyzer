# transcoder-analyzer (CloudTV)

## Purpose

The purpose of this analyzer is to recursively scan a directory for transcoded video logs. We are interested only in the ```vodcache``` folder and the respective ```transcoder_core.txt``` files which contain information about the transcode process (timestamps of events, total duration, source file URL, etc). 

## Approach

The ```transcoder-analyzer``` is available as a module for use in other NodeJS applications, or via CLI using index.js.

## Installation

``` bash
npm install --save transcoder-analyzer
```

## Useage

### From Script

``` javascript
analyzer('/var/opt/transcoder/vodcache/').promise.then(function(results){
    process.exit();
});
```

Notice the ```promise```. Because ```transcoder-analyzer``` uses promises to chain the completion, attach a callback to the promise using ```analyzer(srcDirectory).promise.then(function(results){/*do something with the results*/});```

The results are of the format:

``` javascript
results = {
  video: [
    {
        "Start Time": '<start time in UTC format>',
        "Start Time Formatted": '<Start time, in CSV friendly format for EXCEL>',
        "End Time": '<end time in UTC format>',
        "End Time Formatted": '<End time, in CSV friendly format for EXCEL>',,
        "Transode Time (ms)": '<total time it took to transcode the asset>',
        "Video Duration": '<duration of the src file, per info.xml>',
        "Delay from Realtime (transcodeTime/duration < 1 = realtime)": <float, 1 or less is good, over 1 is bad>,
        "Delay from Realtime (duration - transcodeTime in seconds, negative is good)": <float, negative is good, positive is bad>,
        "Media URL": '<original URL of the media file that was transcoded>'
    },
    ...
  ],

  audio : {
    //same format as 'video' piece, but separated for analysis since 
    //audio is a much faster transcode than video and shouldn't be \
    //counted in any means/max/min/std-deviation type analysis
  }
}
```

### From CLI

``` bash
git clone 'https://github.com/active-video/transcoder-analyzer.git';
cd transcoder-analyzer
npm install

# to get more info, try
# node index.js --help

node index -d /var/opt/transcoder/vodcache/
```

Note that the initial directory listing can take up to 30 seconds before we begin async processing of each directory. The reason for this is that a single /var/opt/transcoder/vodcache/ folder can contain 10k+ entries, and if you are looking at a clone of several (i.e. the output of ```rsync -a /var/opt/transcoder/vodcache ~/vodcache/ --exclude *.vob``` for several transcoders, it could have 100k+ entries.

Once the directories have been indexed, the subsequent processing will display in the console as a status:

```bash

 Status @ 2.350m |   Complete: [▒▒▒▒▒▒▒▒▒▒]  99.95 %   ┊   Transcodes Found: 117070   ┊   Transcodes Processed: 117009   ┊

 ```

**Screenshot in action**

![Progress Screenshot](https://github.com/active-video/transcoder-analyzer/raw/master/assets/progress-screenshot.png)