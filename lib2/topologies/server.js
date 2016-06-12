"use strict"

var inherits = require('util').inherits,
  f = require('util').format,
  bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain,
  EventEmitter = require('events').EventEmitter,
  BSON = require('bson').native().BSON,
  Logger = require('../connection/logger'),
  Pool = require('../connection/pool'),
  Query = require('../connection/commands').Query,
  PreTwoSixWireProtocolSupport = require('../wireprotocol/2_4_support'),
  TwoSixWireProtocolSupport = require('../wireprotocol/2_6_support'),
  ThreeTwoWireProtocolSupport = require('../wireprotocol/3_2_support');

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var Server = function(options) {
  options = options || {};

  // Add event listener
  EventEmitter.call(this);

  // Internal state
  this.s = {
    // Options
    options: options,
    // State variable
    state: DISCONNECTED,
    // Logger
    logger: Logger('Server', options),
    // BSON instance
    bson: options.bson || new BSON(),
    // Pool
    pool: null
  }
}

inherits(Server, EventEmitter);

var eventHandler = function(self, event) {
  return function(err) {
    if(event == 'connect') {
      self.emit('connect', self);
    } else if(event == 'error' || event == 'parseError'
      || event == 'close' || event == 'timeout') {
      self.emit(event, err);
    }
  }
}

Server.prototype.connect = function(options) {
  var self = this;
  options = options || {};

  // Do not allow connect to be called on anything that's not disconnected
  if(self.s.state != DISCONNECTED) {
    throw MongoError.create(f('server instnace in invalid state %s', self.s.state));
  }

  // Create a pool
  self.s.pool = new Pool(Object.assign(self.s.options, options));

  // Set up listeners
  self.s.pool.on('close', eventHandler(self, 'close'));
  self.s.pool.on('error', eventHandler(self, 'error'));
  self.s.pool.on('timeout', eventHandler(self, 'timeout'));
  self.s.pool.on('parseError', eventHandler(self, 'parseError'));
  self.s.pool.on('connect', eventHandler(self, 'connect'));

  // Connect with optional auth settings
  self.s.pool.connect(options.auth)
}

Server.prototype.getDescription = function() {
  var self = this;
}

// Server.prototype.setBSONParserType = function(type) {
// }

Server.prototype.lastIsMaster = function() {
  var self = this;
}

Server.prototype.isMasterLatencyMS = function() {
}

Server.prototype.unref = function() {
  // this.s.pool.unref();
}

Server.prototype.isConnected = function() {
  // return this.s.state == CONNECTED && this.s.pool.isConnected();
}

Server.prototype.isDestroyed = function() {
  // return this.s.state == DESTROYED;
}

function basicValidations(self, options) {
  if(!self.s.pool) return MongoError.create('server instance is not connected');
  if(self.s.pool.isDestroyed()) return MongoError.create('server instance pool was destroyed');
  if(options.readPreference && !(options.readPreference instanceof ReadPreference)) {
    throw new Error("readPreference must be an instance of ReadPreference");
  }
}

function disconnectHandler(self, ns, cmd, options, callback) {
  // Topology is not connected, save the call in the provided store to be
  // Executed at some point when the handler deems it's reconnected
  if(!self.s.pool.isConnected() && self.s.disconnectHandler != null) {
    callback = bindToCurrentDomain(callback);
    self.s.disconnectHandler.add('command', ns, cmd, options, callback);
    return true;
  }

  // If we have no connection error
  if(!self.s.pool.isConnected()) {
    callback(MongoError.create(f("no connection available to server %s", self.name)));
    return true;
  }
}

/**
 * Execute a command
 * @method
 * @param {string} ns The MongoDB fully qualified namespace (ex: db1.collection1)
 * @param {object} cmd The command hash
 * @param {ReadPreference} [options.readPreference] Specify read preference if command supports it
 * @param {Boolean} [options.serializeFunctions=false] Specify if functions on an object should be serialized.
 * @param {Boolean} [options.ignoreUndefined=false] Specify if the BSON serializer should ignore undefined fields.
 * @param {Boolean} [options.fullResult=false] Return the full envelope instead of just the result document.
 * @param {opResultCallback} callback A callback function
 */
Server.prototype.command = function(ns, cmd, options, callback) {
  var self = this;
  if(typeof options == 'function') callback = options, options = {}, options = options || {};
  var result = basicValidations(self, options);
  if(result) return callback(result);

  // Debug log
  if(self.s.logger.isDebug()) self.s.logger.debug(f('executing command [%s] against %s', JSON.stringify({
    ns: ns, cmd: cmd, options: debugOptions(debugFields, options)
  }), self.name));

  // If we are not connected or have a disconnectHandler specified
  if(disconnectHandler(self, ns, cmd, options, callback)) return;

  // Query options
  var queryOptions = {
    numberToSkip: 0,
    numberToReturn: -1,
    checkKeys: typeof options.checkKeys == 'boolean' ? options.checkKeys: false,
    serializeFunctions: typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false,
    ignoreUndefined: typeof options.ignoreUndefined == 'boolean' ? options.ignoreUndefined : false
  };

  // Create a query instance
  var query = new Query(self.s.bson, ns, cmd, queryOptions);
  // Set slave OK of the query
  query.slaveOk = options.readPreference ? options.readPreference.slaveOk() : false;

  // Write options
  var writeOptions = {
    raw: typeof options.raw == 'boolean' ? options.raw : false,
    promoteLongs: typeof options.promoteLongs == 'boolean' ? options.promoteLongs : true
  };

  // Write the operation to the pool
  self.s.pool.write(query.toBin(), writeOptions, callback);
}

Server.prototype.insert = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.update = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.remove = function(ns, ops, options, callback) {
  var self = this;
}

Server.prototype.auth = function(mechanism, db) {
  var self = this;
}

// Server.prototype.addReadPreferenceStrategy = function(name, strategy) {
// Server.prototype.addAuthProvider = function(name, provider) {

Server.prototype.equals = function(server) {
  var self = this;
}

Server.prototype.connections = function() {
  var self = this;
}

Server.prototype.getServer = function(options) {
  return this;
}

Server.prototype.getServerFrom = function(connection) {
  return this;
}

// Server.prototype.getCallbacks = function() {
//   return this.s.callbacks;
// }

// Server.prototype.parserType = function() {
//   var s = this.s;
//   if(s.options.bson.serialize.toString().indexOf('[native code]') != -1)
//     return 'c++';
//   return 'js';
// }

Server.prototype.cursor = function(ns, cmd, cursorOptions) {
  var self = this;
}

// Server.prototype.getConnection = function(options) {
//   return this.s.pool.get();
// }

var listeners = ['close', 'error', 'timeout', 'parseError', 'connect'];

Server.prototype.destroy = function() {
  var self = this;

  // Remove all listeners
  listeners.forEach(function(event) {
    self.s.pool.removeAllListeners(event);
  });

  // Destroy the pool
  this.s.pool.destroy();
}

module.exports = Server;