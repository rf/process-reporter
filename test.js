'use strict';

var test = require('tape');
var setTimeout = require('timers').setTimeout;

var processReporter = require('./index');

test('processReporter reports libuv health', function t(assert) {
    var fakeStatsd = createFakeStatsd();

    var reporter = processReporter({
        handleInterval: 10,
        requestInterval: 10,
        statsd: fakeStatsd
    });
    reporter.bootstrap();

    setTimeout(onReported, 15);

    function onReported() {
        reporter.destroy();

        var records = fakeStatsd.records;
        var handles = records[0];
        var requests = records[1];

        assert.equal(records.length, 2);
        assert.equal(handles.key, 'process-reporter.handles');
        assert.equal(requests.key, 'process-reporter.requests');

        assert.equal(typeof handles.value, 'number');
        assert.equal(typeof requests.value, 'number');

        assert.end();
    }
});

test('processReport global stats', function t(assert) {
    var workerStatsd = createFakeStatsd();
    var clusterStatsd = createFakeStatsd();

    var reporter = processReporter({
        statsd: workerStatsd,
        clusterStatsd: clusterStatsd,
        lagInterval: 10
    });
    reporter.bootstrap();

    setTimeout(onReported, 15);

    function onReported() {
        reporter.destroy();

        var workerRecords = workerStatsd.records;
        var clusterRecords = clusterStatsd.records;

        assert.equal(workerRecords.length, 1);
        assert.equal(clusterRecords.length, 1);

        assert.equal(workerRecords[0].key, 'process-reporter.lag-sampler');
        assert.equal(clusterRecords[0].key, 'process-reporter.lag-sampler');
        assert.equal(typeof workerRecords[0].value, 'number');
        assert.equal(typeof clusterRecords[0].value, 'number');
        assert.equal(workerRecords[0].type, 'timing');
        assert.equal(clusterRecords[0].type, 'timing');

        assert.end();
    }

});

test('processReporter caches memory usage and lag time', function t(assert) {
    var workerStatsd = createFakeStatsd();
    var clusterStatsd = createFakeStatsd();

    var reporter = processReporter({
        statsd: workerStatsd,
        clusterStatsd: clusterStatsd,
        lagInterval: 10,
        memoryInterval: 10
    });
    reporter.bootstrap();

    setTimeout(onReported, 15);

    function onReported() {
        assert.notEqual(reporter.getCachedLagTime(), null);
        assert.notEqual(reporter.getCachedMemoryUsage(), null);
        reporter.destroy();
        assert.end();
    }
});

test('processReporter prefix', function t(assert) {
    var fakeStatsd = {
        records: [],
        timing: function timing(key, value) {
            this.records.push({
                key: key,
                value: value,
                type: 'timing'
            });
        },
        gauge: function gauge(key, value) {
            this.records.push({
                key: key,
                value: value,
                type: 'gauge'
            });
        }
    };

    var reporter = processReporter({
        handleInterval: 10,
        requestInterval: 10,
        statsd: fakeStatsd,
        prefix: 'foobarbaz'
    });
    reporter.bootstrap();

    setTimeout(onReported, 15);

    function onReported() {
        reporter.destroy();

        var records = fakeStatsd.records;
        var handles = records[0];
        var requests = records[1];

        assert.equal(records.length, 2);
        assert.equal(handles.key, 'foobarbaz.process-reporter.handles');
        assert.equal(requests.key, 'foobarbaz.process-reporter.requests');

        assert.equal(typeof handles.value, 'number');
        assert.equal(typeof requests.value, 'number');

        reporter.destroy();

        assert.end();
    }
});

test('process reporter disable all', function t(assert) {
    var reporter = processReporter({
        handleEnabled: false,
        requestEnabled: false,
        memoryEnabled: false,
        lagEnabled: false,
        gcEnabled: false,
        statsd: {}
    });
    reporter.bootstrap();

    assert.strictEqual(reporter.handleTimer, null);
    assert.strictEqual(reporter.requestTimer, null);
    assert.strictEqual(reporter.memoryTimer, null);
    assert.strictEqual(reporter.lagTimer, null);
    assert.strictEqual(reporter._onStatsListener, null);

    // Don't teardown, test should exit
    assert.end();
});

test('process reporter disable all safely shuts down', function t(assert) {
    var reporter = processReporter({
        handleEnabled: false,
        requestEnabled: false,
        memoryEnabled: false,
        lagEnabled: false,
        gcEnabled: false,
        statsd: {}
    });
    reporter.bootstrap();

    assert.strictEqual(reporter.handleTimer, null);
    assert.strictEqual(reporter.requestTimer, null);
    assert.strictEqual(reporter.memoryTimer, null);
    assert.strictEqual(reporter.lagTimer, null);
    assert.strictEqual(reporter._onStatsListener, null);

    reporter.destroy();

    assert.end();
});

function createFakeStatsd() {
    return {
        records: [],
        timing: function timing(key, value) {
            this.records.push({
                key: key,
                value: value,
                type: 'timing'
            });
        },
        gauge: function gauge(key, value) {
            this.records.push({
                key: key,
                value: value,
                type: 'gauge'
            });
        }
    };
}
