var
	DEFAULT_PORT = process.env.PORT,
	DEFAULT_EVENT_NAME = "message",

	Server = require("../common/server"),
	ioFactory = require("socket.io"),
	commons = require("commons"),
	debug = require("debug")("server:socket.io"),
	on = commons.stream.on,
	asynchronize = commons.async.asynchronize,
	ServerWithSocketIO = {};

ServerWithSocketIO.port = DEFAULT_PORT || 8888;

ServerWithSocketIO.eventName = DEFAULT_EVENT_NAME;

ServerWithSocketIO.create = function createSocketIoServer(httpServer) {
	// ----- create a local HTTP server if no one is provided
	httpServer = httpServer || require("http").createServer(null);

	var
		io,
		server = Server.create(),
		connections = {};

	function startServer() {
		try {
			io = ioFactory(httpServer);

			io.sockets.on("connection", function(socket) {
				debug("connection opened:", socket.id);
				connections[socket.id] = socket;
				socket.on("disconnect", function() {
					debug("connection closed:", socket.id);
					delete connections[socket.id];
					server.connectionDropped.push(socket.id);
				});
				socket.on(ServerWithSocketIO.eventName, function(msg) {
					server.messageReceived.push({connectionId: socket.id, msg: msg});
				});
				server.connectionEstablished.push(socket.id);
			});

			httpServer.listen(ServerWithSocketIO.port, server.async.setStarted(true));
		} catch(err) {
			console.error(err);
			server.setStarted(false);
		}
	}

	function stopServer() {
		try {
			httpServer.close(server.async.setStopped());
			cleanUpConnections();
		} catch(err) {
			console.error(err);
			server.setStopped();
		}
	}

	function cleanUpConnections() {
		for (var connectionId in connections) {
			debug("cleaning up connection:", connectionId);
			connections[connectionId].disconnect();
		}
	}

	on(server.stateChanged, "->STARTING", startServer);
	on(server.stateChanged, "->STOPPING", stopServer);

	on(server.stateChanged, "->STOPPED", function() {
		debug("server stopped");
	});

	on(server.stateChanged, "->LISTENING", function() {
		debug("server started");
	});

	// ----- commands -----
	server.sendMessage = function sendMessageOverSocketIO(envelope) {
		var
			connectionId = envelope.connectionId,
			msg = envelope.msg,
			connection = connections[connectionId];

		if (connection) {
			connection.emit(ServerWithSocketIO.eventName, msg);
			return true;
		} else {
			return false;
		}
	};

	server.async = asynchronize(server);

	return server;
};

module.exports = ServerWithSocketIO;
