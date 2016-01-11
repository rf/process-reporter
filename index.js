'use strict';

var path = require('path');
var timers = require('timers');
var process = global.process;
var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var _toobusy;
var _gcstats;

var _gcEmitter = new EventEmitter();
_gcEmitter.setMaxListeners(100);

/*eslint max-statements: [2, 50]*/
/*eslint complexity: [2, 15]*/
function ProcessReporter(options) {
    assert(typeof options === 'object', 'options required');

    this.statsd = options.statsd;
    assert(typeof this.statsd === 'object', 'options.statsd required');

    this.handleInterval = options.handleInterval || 1000;
    assert(
        typeof this.handleInterval === 'number',
        'expected options.handleInterval to be number'
    );

    this.requestInterval = options.requestInterval || 100;
    assert(
        typeof this.requestInterval === 'number',
        'expected options.requestInterval to be number'
    );

    this.memoryInterval = options.memoryInterval || 1000;
    assert(
        typeof this.memoryInterval === 'number',
        'expected options.memoryInterval to be number'
    );

    this.lagInterval = options.lagInterval || 500;
    assert(
        typeof this.lagInterval === 'number',
        'expected options.lagInterval to be number'
    );

    this.timers = options.timers || timers;
    assert(
        typeof this.timers === 'object' &&
            typeof this.timers.setTimeout === 'function' &&
            typeof this.timers.clearTimeout === 'function',
        'expected options.timers to be object with setTimeout and ' +
            'clearTimeout functions'
    );

    this.prefix = options.prefix || '';
    assert(
        typeof this.prefix === 'string',
        'expected options.prefix to be string'
    );

    if (this.prefix[this.prefix.length - 1] !== '.' && this.prefix !== '') {
        this.prefix = this.prefix + '.';
    }

    if (typeof options.handleEnabled === 'boolean') {
        this.handleEnabled = options.handleEnabled;
    } else {
        this.handleEnabled = true;
    }

    if (typeof options.requestEnabled === 'boolean') {
        this.requestEnabled = options.requestEnabled;
    } else {
        this.requestEnabled = true;
    }

    if (typeof options.memoryEnabled === 'boolean') {
        this.memoryEnabled = options.memoryEnabled;
    } else {
        this.memoryEnabled = true;
    }

    if (typeof options.lagEnabled === 'boolean') {
        this.lagEnabled = options.lagEnabled;
    } else {
        this.lagEnabled = true;
    }

    if (typeof options.gcEnabled === 'boolean') {
        this.gcEnabled = options.gcEnabled;
    } else {
        this.gcEnabled = true;
    }

    this.handleTimer = null;
    this.requestTimer = null;
    this.memoryTimer = null;
    this.lagTimer = null;
    this._onStatsListener = null;

    this._setupClosure();
}

ProcessReporter.prototype._setupClosure =
function _setupClosure() {
    var self = this;

    if (self.gcEnabled) {
        self._onStatsListener = onStats;
    }

    function onStats(gcInfo) {
        self._reportGCStats(gcInfo);
    }
};

ProcessReporter.prototype.bootstrap = function bootstrap() {
    var self = this;

    if (!_toobusy && self.lagEnabled) {
        /*eslint-disable global-require*/
        _toobusy = require('toobusy');
        /*eslint-enable global-require*/
    }

    if (!_gcstats && self.gcEnabled) {
        /*eslint-disable camelcase, global-require */
        _gcstats = require('bindings')({
            bindings: 'gcstats',
            module_root: path.join(__dirname, 'node_modules', 'gc-stats')
        });
        /*eslint-enable global-require, camelcase*/
        _gcstats.afterGC(onGC);
    }

    if (self.handleEnabled) {
        self.handleTimer = self.timers.setTimeout(
            onHandle,
            self.handleInterval
        );
    }

    if (self.requestEnabled) {
        self.requestTimer = self.timers.setTimeout(
            onRequest,
            self.requestInterval
        );
    }

    if (self.memoryEnabled) {
        self.memoryTimer = self.timers.setTimeout(
            onMemory,
            self.memoryInterval
        );
    }

    if (self.lagEnabled) {
        self.lagTimer = self.timers.setTimeout(
            onLag,
            self.lagInterval
        );
    }

    if (self.gcEnabled) {
        _gcEmitter.on('stats', self._onStatsListener);
    }

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

    if (_toobusy) {
        _toobusy.shutdown();
    }

    if (self.gcEnabled) {
        _gcEmitter.removeListener('stats', self._onStatsListener);
    }
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
    /*eslint-disable no-restricted-syntax*/
    try {
        return process.memoryUsage();
    } catch (err) {
        return null;
    }
    /*eslint-enable no-restricted-syntax*/
};

ProcessReporter.prototype._reportLag = function _reportLag() {
    var self = this;

    self.statsd.timing(
        self.prefix + 'process-reporter.lag-sampler',
        _toobusy.lag()
    );
};

ProcessReporter.prototype._reportGCStats = function _reportGCStats(gcInfo) {
    var self = this;

    var prefix = self.prefix + 'process-reporter.gc.' + formatGCType(gcInfo);

    self.statsd.timing(prefix + '.pause-ms', gcInfo.pauseMS);
    self.statsd.gauge(prefix + '.heap-used', gcInfo.diff.usedHeapSize);
    self.statsd.gauge(prefix + '.heap-total', gcInfo.diff.totalHeapSize);
};

module.exports = createProcessReporter;

function createProcessReporter(options) {
    return new ProcessReporter(options);
}

function formatGCType(gcInfo) {
    var type;
    switch (gcInfo.gctype) {
        case 1:
            type = 'minor';
            break;

        case 2:
            type = 'major';
            break;

        case 3:
            type = 'both';
            break;

        default:
            type = 'unknown';
            break;
    }

    return type;
}

function onGC(gcInfo) {
    _gcEmitter.emit('stats', gcInfo);
}
