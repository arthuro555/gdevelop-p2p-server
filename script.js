// Server
/**
 * Logs a message to a DOM paragraph. 
 * Useful to give infos about important events to user.
 */
function log(message) {
	const logger = document.getElementById("logger");
	logger.innerText = logger.innerText + "\n" + message;
}

/**
 * A helper function to not have to write the try catch everytime.
 * @param {string} json 
 */
function parseJSON(json) {
	try {
		return JSON.parse(json);
	} catch {
		return undefined;
	}
}

/**
 * A map containing all wrapped connections 
 * to individual players.
 * 
 * A map is used to 
 * 1. Make sure there is only one connection per player. 
 *    New ones will override old ones and let the old ones be garbage collected. 
 *    If we were using an array we would have to iterate over the whole array 
 *    which is probably less effective than a map lookup.
 * 2. Better iterability and faster than a normal object.
 */
const players = new Map(); // Player manager

/**
 * A wrapper for Data Connections 
 * that auto registers into the 
 * players map. Closes old
 * connection if from the same 
 * client.
 * 
 * @see players
 */
class Player {
	x = 0;
	y = 0;
	animation = 0;
	flip = 0;
	
	/**
	 * @param {peerjs.DataConnection} connection - The DataConnection of the client.
	 */
	constructor(connection) {
		this._c = connection;
		this.id = connection.peer;
		if(players.has(this.id)) players.get(this.id).close();
		connection.on("close", () => {
			this.close();
			log("Disconnected: " + this.id);
		});
		connection.on("error", error => {
			this.close();
			players.delete(this.id);
			log("An Error occured while communicating with " + this.id + ", connection closed. " + error);
		});
		connection.on("open", () => {
			log("Connected: " + this.id);
			players.set(this.id, this);
			updateList();
		});
		connection.on("data", e => this.onUpdate(e));

		// Regularly check for disconnection as the built in way is not reliable.
		const player = this;
		let disconnectChecker = function () {
			if (
				player._c.peerConnection.connectionState === 'failed' ||
				player._c.peerConnection.connectionState === 'disconnected'
			) {
				player.close();
			} else {
				setTimeout(disconnectChecker, 500);
			}
		};
		disconnectChecker();
	}

	_sendEventToAll(name, payload, skipStringify) {
		for(let [key, player] of players) {
			if(key === this.id) continue;
			player.send(name, payload, skipStringify);
		}
	}

	send(name, payload, skipStringify) {
		this._c.send({
			eventName: name,
			data: skipStringify ? payload : JSON.stringify(payload),
		});
	}
	
	/**
	 * Gracefully close the connection and 
	 * remove reference from manager for garbage collection.
	 */
	close() {
		this._c.close();
		if(players.get(this.id) === this) players.delete(this.id);
		updateList();
		setTimeout(() => this._sendEventToAll("disconnected", this.id, true), 500);
	}
	
	/**
	 * Handles incoming events from the wrapped client.
	 */
	onUpdate(e) {
		// Verify for GDevelop event
		if(e === undefined || e.eventName === undefined) return;
		const data = JSON.parse(e.data);
		if(e.eventName === "update") {
			if(data === undefined) return;
			this.x = data.x || 0;
			this.y = data.y || 0;
			this.animation = data.animation || 0;
			this.updateClient();
			updateList();
		}
		if(e.eventName === "flip") {
			this.flip = data;
		}
	}
	
	/**
	 * Send the wrapped client the current state of the other players.
	 * This should only be done when requested by the game for server performance reasons.
	 */
	updateClient() {
		let payload = [];
		for(let [key, player] of players) {
			if(key === this.id) continue;
			payload.push({
				x: player.x,
				y: player.y,
				animation: player.animation,
				flip: player.flip,
				name: key,
			});
		}
		this.send("update", payload);
	}
}

/** The main Peer JS instance */
const peer = new Peer("ServerIDGDEVELOP555", {debug: 2});

peer.on("open", () => log("Server Connected to P2P network."));

peer.on("close", () => log("Connection to network lost. Please reload page."));

peer.on("connection", connection => {
	const id = connection.peer;
	if(players.has(id)) {
		players.get(id).close();
	}
	new Player(connection);
});

// Server UI
const list = document.getElementById("list");
function updateList() {
	while (list.lastElementChild) {
		list.removeChild(list.lastElementChild);
	}
	for(let [c, player] of players) {
		const li = document.createElement("li");
		list.appendChild(li);
		const id = document.createElement("h5");
		id.innerText = c;
		li.appendChild(id);
		const posX = document.createElement("h6");
		posX.innerText = "X: " + player.x;
		li.appendChild(posX);
		const posY= document.createElement("h6");
		posY.innerText = "Y: " + player.y;
		li.appendChild(posY);
	}
}


// Client (for tests)
let p = new Peer();
let c;
document.getElementById("connect").addEventListener("click", () => {
	c = p.connect(peer.id);
	// c.on("data", console.log);
});

document.getElementById("disconnect").addEventListener("click", () => {
	c.close();
});

const posXi = document.getElementById("posX");
const posYi = document.getElementById("posY");
document.getElementById("update").addEventListener("click", () => {
	c.send({
		eventName: "update",
		data: JSON.stringify({
			x: posXi.value,
			y: posYi.value,
		}),
	});
});
