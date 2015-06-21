'use strict';

var timers = require('timers');
var process = require('process');
var toobusy = require('toobusy');
var assert = require('assert');

module.exports = ProcessReporter;

function ProcessReporter(options) {
    if (!(this instanceof ProcessReporter)) {
        return new ProcessReporter(options);
    }

    var self = this;

    assert(typeof options === 'object', 'options required');
    assert(typeof options.statsd === 'object', 'options.statsd required');

    self.handleInterval = options.handleInterval || 1000;
    self.requestInterval = options.requestInterval || 100;
    self.memoryInterval = options.memoryInterval || 1000;
    self.lagInterval = options.lagInterval || 500;

    self.statsd = options.statsd;

    self.handleTimer = null;
    self.requestTimer = null;
    self.memoryTimer = null;
    self.lagTimer = null;

    self.timers = options.timers || timers;
}

ProcessReporter.prototype.bootstrap = function bootstrap() {
    var self = this;

    self.handleTimer = self.timers.setTimeout(onHandle, self.handleInterval);
    self.requestTimer =
        self.timers.setTimeout(onRequest, self.requestInterval);
    self.memoryTimer = self.timers.setTimeout(onMemory, self.memoryInterval);
    self.lagTimer = self.timers.setTimeout(onLag, self.lagInterval);

    function onHandle() {
        self._reportHandle();
        self.handleTimer =
            self.timers.setTimeout(onHandle, self.handleInterval);
    }

    function onRequest() {
        self._reportRequest();
        self.requestTimer =
            self.timers.setTimeout(onHandle, self.handleInterval);
    }

    function onMemory() {
        self._reportMemory();
        self.memoryTimer =
            self.timers.setTimeout(onMemory, self.memoryInterval);
    }

    function onLag() {
        self._reportLag();
        self.lagTimer = self.timers.setTimeout(onLag, self.lagInterval);
    }
};

ProcessReporter.prototype.destroy = function destroy() {
    var self = this;

    self.timers.clearTimeout(self.handleTimer);
    self.timers.clearTimeout(self.requestTimer);
    self.timers.clearTimeout(self.memoryTimer);
    self.timers.clearTimeout(self.lagTimer);

    toobusy.shutdown();
};

ProcessReporter.prototype._reportHandle = function _reportHandle() {
    var self = this;

    var num = process._getActiveHandles().length;
    self.statsd.timing('process-reporter.handles', num);
};

ProcessReporter.prototype._reportRequest = function _reportRequest() {
    var self = this;

    var num = process._getActiveRequests().length;
    self.statsd.timing('process-reporter.requests', num);
};

ProcessReporter.prototype._reportMemory = function _reportMemory() {
    var self = this;

    var usage = process.memoryUsage();
    var prefix = 'process-reporter.memory-usage';

    self.statsd.gauge(prefix + '.rss', usage.rss);
    self.statsd.gauge(prefix + '.heap-used', usage.heapUsed);
    self.statsd.gauge(prefix + '.heap-total', usage.heapTotal);
};

ProcessReporter.prototype._reportLag = function _reportLag() {
    var self = this;

    self.statsd.timing('process-reporter.lag-sampler', toobusy.lag());
};
