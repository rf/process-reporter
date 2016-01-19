'use strict';

var http = require('http');
var NullStatsd = require('uber-statsd-client/null');
var createProcessReporter = require('./index.js');

var reporter = createProcessReporter({
    statsd: NullStatsd()
});
reporter.bootstrap();

var server = http.createServer(onRequest);
server.listen(3000);

function onRequest(req, res) {
    var elem = null;
    if (!reporter.statsd._buffer.isEmpty()) {
        elem = reporter.statsd._buffer.peek();
    }

    res.end(JSON.stringify(elem) + '\n');
}
