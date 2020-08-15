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
	
	/**
	 * @ param {peerjs.DataConnection} connection - The DataConnection of the client.
	 */
	constructor(connection) {
		this._c = connection;
		this.id = connection.peer;
		if(players.has(this.id)) players.get(this.id).close();
		connection.on("close", () => {
			if(players.get(this.id) === this) players.delete(this.id);
			log("Disconnected: " + this.id);
			updateList();
		});
		connection.on("error", error => {
			this._c.close();
			players.delete(this.id);
			log("An Error occured while communicating with " + this.id + ", connection closed. " + error);
		});
		connection.on("open", () => {
			log("Connected: " + this.id);
			players.set(this.id, this);
			updateList();
		});
		connection.on("data", data => this.onUpdate(data));
	}
	
	/**
	 * Gracefully close the connection and 
	 * remove reference from manager for garbage collection.
	 */
	close() {
		this._c.close();
		players.delete(this.id);
	}
	
	/**
	 * Handles incoming events from the wrapped client.
	 */
	onUpdate(data) {
		// Verify for GDevelop event
		if(data.eventName === undefined) return;
		if(data.eventName === "update") {
			if(data.data === undefined) return;
			this.x = data.data.x || 0;
			this.y = data.data.y || 0;
			this.updateClient();
			updateList();
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
				name: key,
			});
		}
		this._c.send({
			eventName: "update",
			data: payload,
		});
	}
}

/** The main Peer JS instance */
const peer = new Peer({debug: 2});

peer.on("open", () => log("Server Connected to P2P network."));

peer.on("close", () => log("Connection to network lost. Please reload page."));

peer.on("connection", connection => {
	const id = connection.peer;
	if(players.has(id)) {
		players.get(id).close();
	}
	new Player(connection);
});


// Client (for tests)
let p = new Peer();
let c;
document.getElementById("connect").addEventListener("click", () => {
	c = p.connect(peer.id);
	c.on("data", console.log);
});

document.getElementById("disconnect").addEventListener("click", () => {
	c.close();
});

const posXi = document.getElementById("posX");
const posYi = document.getElementById("posY");
document.getElementById("update").addEventListener("click", () => {
	c.send({
		eventName: "update",
		data: {
			x: posXi.value,
			y: posYi.value,
		},
	});
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
