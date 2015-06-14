var
	Stately = require("stately.js"),
	Bacon = require("baconjs"),
	commons = require("commons"),
	debug = require("debug")("server:base"),
	serverStates = {
		STOPPED: {
			Start: "STARTING"
		},
		STARTING: {
			_started: "LISTENING",
			_startFailed: "STOPPED"
		},
		LISTENING: {
			Stop: "STOPPING"
		},
		STOPPING: {
			_stopped: "STOPPED"
		}
	},
	Server = {};

Server.create = function createServer() {
	var
		serverFsm = Stately.machine(serverStates),
		fsmWrapper = commons.fsm.fromStatelyMachine(serverFsm),
		server = {};

	// ----- commands -----
	server.start = fsmWrapper.getWrappedFunction("Start");
	server.stop = fsmWrapper.getWrappedFunction("Stop");
	server.setStarted = fsmWrapper.getBooleanDispatcherFunction("_started", "_startFailed");
	server.setStopped = fsmWrapper.getWrappedFunction("_stopped");
	server.sendMessage = null; // must be implemented by concrete servers

	// ----- events -----
	server.stateChanged = commons.stream.fsm2stream(serverFsm);
	server.connectionEstablished = new Bacon.Bus();
	server.connectionDropped = new Bacon.Bus();
	server.messageReceived = new Bacon.Bus();

	server.stateChanged.onValue(debug);
	return server;
};

module.exports = Server;
