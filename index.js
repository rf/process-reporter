'use strict';

var timers = require('timers');
var process = require('process');
var toobusy = require('toobusy');
var assert = require('assert');

module.exports = ProcessReporter;

/*eslint max-statements: [1, 30]*/
function ProcessReporter(options) {
    if (!(this instanceof ProcessReporter)) {
        return new ProcessReporter(options);
    }

    var self = this;

    assert(typeof options === 'object', 'options required');

    self.statsd = options.statsd;
    assert(typeof self.statsd === 'object', 'options.statsd required');

    self.handleInterval = options.handleInterval || 1000;
    assert(
        typeof self.handleInterval === 'number',
        'expected options.handleInterval to be number'
    );

    self.requestInterval = options.requestInterval || 100;
    assert(
        typeof self.requestInterval === 'number',
        'expected options.requestInterval to be number'
    );

    self.memoryInterval = options.memoryInterval || 1000;
    assert(
        typeof self.memoryInterval === 'number',
        'expected options.memoryInterval to be number'
    );

    self.lagInterval = options.lagInterval || 500;
    assert(
        typeof self.lagInterval === 'number',
        'expected options.lagInterval to be number'
    );

    self.timers = options.timers || timers;
    assert(
        typeof self.timers === 'object' &&
            typeof self.timers.setTimeout === 'function' &&
            typeof self.timers.clearTimeout === 'function',
        'expected options.timers to be object with setTimeout and ' +
            'clearTimeout functions'
    );

    self.prefix = options.prefix || '';
    assert(
        typeof self.prefix === 'string',
        'expected options.prefix to be string'
    );

    if (self.prefix[self.prefix.length - 1] !== '.' && self.prefix !== '') {
        self.prefix = self.prefix + '.';
    }

    self.handleTimer = null;
    self.requestTimer = null;
    self.memoryTimer = null;
    self.lagTimer = null;
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
            self.timers.setTimeout(onRequest, self.requestInterval);
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
    self.statsd.timing(self.prefix + 'process-reporter.handles', num);
};

ProcessReporter.prototype._reportRequest = function _reportRequest() {
    var self = this;

    var num = process._getActiveRequests().length;
    self.statsd.timing(self.prefix + 'process-reporter.requests', num);
};

ProcessReporter.prototype._reportMemory = function _reportMemory() {
    var self = this;

    var usage = self._memoryUsage();
    // Evidently, process.memoryUsage() may throw EMFILE.
    if (!usage) {
        return;
    }
    var memPrefix = self.prefix + 'process-reporter.memory-usage';

    self.statsd.gauge(memPrefix + '.rss', usage.rss);
    self.statsd.gauge(memPrefix + '.heap-used', usage.heapUsed);
    self.statsd.gauge(memPrefix + '.heap-total', usage.heapTotal);
};

ProcessReporter.prototype._memoryUsage = function _memoryUsage() {
    try {
        return process.memoryUsage();
    } catch (err) {
        return null;
    }
};

ProcessReporter.prototype._reportLag = function _reportLag() {
    var self = this;

    self.statsd.timing(
        self.prefix + 'process-reporter.lag-sampler',
        toobusy.lag()
    );
};
