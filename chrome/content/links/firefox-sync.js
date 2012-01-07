'use strict';

// prefix: ffs_

function FirefoxSyncLink () {
	//TreeBasedLink.call(this, 'ffs');

	this.name     = 'firefoxSync';
	this.fullName = 'Firefox Sync';

	this.email    = localStorage.ffs_email;
	this.password = localStorage.ffs_password;
}

FirefoxSyncLink.prototype.getPassword = function () {
	if (this.password) return this.password;
	this.password = prompt('Firefox Sync password:');
	localStorage["ffs_password"] = this.password;
	return this.password;
};

FirefoxSyncLink.prototype.getUsername = function () {
	if (!this.username) {
		if (!this.email) return undefined; // no email, no username
		// the username is encoded with base32(sha1(email))
		this.username = baseenc.b32encode(str_sha1(this.email)).toLowerCase();
	}
	return this.username;
}

FirefoxSyncLink.prototype.start = function () {

	// log in

	var xhr = new XMLHttpRequest();
	// get the node
	xhr.open('GET', 'https://auth.services.mozilla.com/user/1.0/'+this.getUsername()+'/node/weave', true);
	xhr.onload = function () {
		this.server_node_url = xhr.responseText;
		this.getCollections();
	}.bind(this);
	xhr.send();
};

FirefoxSyncLink.prototype.sendRequest = function (path, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', this.server_node_url+'1.0/'+this.getUsername()+path, true);
	xhr.setRequestHeader("Authorization", "Basic "+btoa(this.getUsername+':'+this.getPassword()));
	xhr.onload  = function () {
		callback(true, xhr);
	}.bind(this);
	xhr.onerror = function () {
		callback(false, xhr);
	}.bind(this);
	xhr.send();
};

FirefoxSyncLink.prototype.getCollections = function () {
	this.sendRequest ('/info/collections',
			function (success, xhr) {
				if (!success) {
					console.error('Failed to load collection timestamps:');
					console.log(xhr);
					return;
				}
				this.collection_mtimes = JSON.parse(xhr.responseText);
				this.getKeys();
			}.bind(this));
};

FirefoxSyncLink.prototype.getKeys = function () {
	this.sendRequest('/storage/key?full=1', this.getKeys_callback.bind(this));
};

FirefoxSyncLink.prototype.getKeys_callback = function (success, xhr) {
	if (!success) {
		console.error('Failed to get keys:');
		console.log(xhr);
		return;
	}
	var keys = JSON.parse(xhr.responseText);
	console.log(keys);

	// I hope this is a bit future-proof, but I doubt it...
	this.privkey_data = JSON.parse(keys[0].payload);
	this.pubkey_data = JSON.parse(keys[1].payload);
};

// test whether the engine works
FirefoxSyncLink.prototype.test = function () {
	this.sendRequest('/storage/bookmarks/-UOuT3k7plln', 
		function (success, xhr) {
			console.log(xhr.responseText);
		}.bind(this));
};

if (debug) {
	var ffs = new FirefoxSyncLink();
	ffs.start();
}
