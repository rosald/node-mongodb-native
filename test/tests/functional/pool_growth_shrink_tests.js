"use strict";

/**
 * Correctly cause pool to grow
 */
exports['Example of simple parallel insert into db'] = {
  metadata: {
    requires: {
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
      , size: 3
    })

    // Number of operations done
    var numberOfOpsDone = 0;
    var numberOfPoolConnectionExpansion = 1;

    // LINE var Server = require('mongodb-core').Server,
    // LINE   test = require('assert');
    // LINE var server = new Server({host: 'localhost', port: 27017});
    // REMOVE-LINE test.done();
    // BEGIN
    // Add event listeners
    server.on('connect', function(_server) {
      _server.s.pool.on('connection', function() {
        numberOfPoolConnectionExpansion = numberOfPoolConnectionExpansion + 1;
      });

      var left = 100;
      for(var i = 0; i < 100; i++) {
        // Execute the insert
        _server.insert('integration_tests.inserts_example1', [{a:i}], {
          writeConcern: {w:1}, ordered:true
        }, function(err, results) {
          test.equal(null, err);
          test.equal(1, results.result.n);

          left = left - 1;
          if(left == 0) {
            test.equal(3, numberOfPoolConnectionExpansion);
            _server.destroy();
            test.done();
          }
        });        
      }
    });

    // Start connection
    server.connect();
    // END
  }
}