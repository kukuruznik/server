/* global describe, it */
var
	HOST = process.env.IP,
	PORT = process.env.PORT,
	SERVER_URL = "http://0.0.0.0:5678",

	should = require("chai").should(),
	http = require("http"),
	commons = require("commons"),
	on = commons.stream.on,
	asyncTools = commons.async,
	SocketIO_client = require("socket.io-client"),
	SocketIO_server = require("../socket.io/socketIO-server"),
	async = asyncTools.asynchronize(global); // let's prepare the async version of setTimeout() and such...

function getClient() {
	var
		io = SocketIO_client(SERVER_URL, {multiplex: false});

	io.async = asyncTools.asynchronize(io);
	return io;
}

describe("the SocketIO server", function() {

	it("can be created without providing an HTTP server", function(done) {
		var
			server = SocketIO_server.create();

		server.should.exist;

		// initiate shutdown once the server is up
		on(server.stateChanged, "->LISTENING", server.async.stop());

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("can be created with a provided HTTP server", function(done) {
		var
			httpServer = http.createServer(null),
			server = SocketIO_server.create(httpServer);

		server.should.exist;

		// initiate shutdown once the server is up
		on(server.stateChanged, "->LISTENING", server.async.stop());

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("can be started and stopped several times", function(done) {
		var
			server = SocketIO_server.create(),
			counter = 0;

		// increment the counter and initiate shutdown once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			counter++;
			server.stop();
		});

		// if we shut down for the third time, finish the test, otherwise start the server again
		on(server.stateChanged, "->STOPPED", function() {
			counter === 3 ? done() : server.start();
		});

		// kick it off
		server.start();
	});

	it("when started listens for socketIO connections", function(done) {
		var
			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// once the client is connected, initiate server shutdown to finish
			io.on("connect", async.setTimeout(server.async.stop(), 10));
		});

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("when stopped closes opened connections", function(done) {
		var
			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// finish the test when the client is disconnected
			// (if this is fragile we can set some flag here and finish the test only when the server has been stopped)
			io.on("disconnect", done.bind(null, null)); // done() must be called with 0 args if there is no error

			// schedule server shutdown
			setTimeout(server.async.stop(), 20);
		});

		// kick it off
		server.start();
	});

	it("notifies about established connections", function(done) {
		var
			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			getClient();
		});

		// when notified about the established connection, initiate server shutdown
		server.connectionEstablished.onValue(async.setTimeout(server.async.stop(), 10));

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("notifies about dropped connections", function(done) {
		var
			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// once the client is connected, initiate disconnect to finish
			io.on("connect", io.async.disconnect());
		});

		// when notified about the established connection, initiate server shutdown
		server.connectionDropped.onValue(async.setTimeout(server.async.stop(), 0));

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("sends message to the connected client", function(done) {
		var
			DATA = 2,

			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// receive the message, check the content, then stop the server to finish the test
			io.on(SocketIO_server.eventName, function(msg) {
				should.equal(msg.payload, DATA);
				server.stop();
			});
		});

		// send a message when a client connects
		server.connectionEstablished.onValue(function(connectionId) {
			asyncTools.enqueue(null, server.async.sendMessage({connectionId: connectionId, msg: {payload: DATA}}));
		});

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("receives message from the connected client", function(done) {
		var
			DATA = 2,

			server = SocketIO_server.create();

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// send the message once connected
			io.on("connect", function() {
				io.emit(SocketIO_server.eventName, {payload: DATA});
			});
		});

		// receive the message and initiate server shutdown
		server.messageReceived.onValue(function(envelope) {
			should.equal(envelope.msg.payload, DATA);
			server.stop();
		});

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});

	it("can identify the client from the received message", function(done) {
		var
			DATA = 2,

			server = SocketIO_server.create(),
			connectionId;

		function saveConnectionId(id) {
			connectionId = id;
		}

		// set up the client and connect once the server is up
		on(server.stateChanged, "->LISTENING", function() {
			var
				io = getClient();

			// send the message once connected
			io.on("connect", function() {
				io.emit(SocketIO_server.eventName, {payload: DATA});
			});
		});

		// remember the client's ID
		server.connectionEstablished.onValue(saveConnectionId);

		// receive the message, check the connection ID and initiate server shutdown
		server.messageReceived.onValue(function(envelope) {
			var
				msg = envelope.msg;

			should.equal(envelope.connectionId, connectionId);
			should.equal(msg.payload, DATA);
			server.stop();
		});

		// finish the test once the server is stopped
		on(server.stateChanged, "->STOPPED", done.bind(null, null)); // done() must be called with 0 args if there is no error

		// kick it off
		server.start();
	});
});
