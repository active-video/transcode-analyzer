var analyzer = require('./transcode-analyzer.js');
var commandLineArgs = require('command-line-args');

var cli = commandLineArgs([
    { name: 'verbose', alias: 'v', type: Boolean},
    { name: 'help', alias: 'h', type: Boolean, defaultOption: true},
    { name: 'directory', alias: 'd', type: String, multiple: false},
    { name: 'output', alias: 'o', type: String }
]);

var options = cli.parse();
console.log('options: ', options);
if(options.help) {
    console.log(cli.getUsage());
} else {
    var output = (options.output || './results');
    analyzer(
        options.directory || './',
        output,
        options.verbose || false
    ).promise.then(function(results){
        process.exit();
    });
}

