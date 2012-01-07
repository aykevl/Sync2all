'use strict';

// prefix: ffs_

function FirefoxSyncLink () {
	TreeBasedLink.call(this, 'ffs');

	this.name     = 'firefoxSync';
	this.fullName = 'Firefox Sync';
	this.HMAC_INPUT = "Sync-AES_256_CBC-HMAC256";

	this.email      = localStorage.ffs_email;
	this.password   = localStorage.ffs_password;
	this.synckey_ui = localStorage.ffs_synckey_ui;
}

FirefoxSyncLink.prototype.__proto__ = TreeBasedLink.prototype;

FirefoxSyncLink.prototype.getUsername = function () {
	if (!this.username) {
		if (!this.email) return undefined; // no email, no username
		// the username is encoded with base32(sha1(email))
		this.username = baseenc.b32encode(str_sha1(this.email)).toLowerCase();
	}
	return this.username;
}

FirefoxSyncLink.prototype.getPassword = function () {
	if (!this.password) {
		this.password = prompt('Firefox Sync password:');
		localStorage["ffs_password"] = this.password;
	}
	return this.password;
};

FirefoxSyncLink.prototype.getSyncKey = function () {
	if (!this.synckey) {
		this.synckey = b32decode(this.synckey_ui.replace(/-/g, '').replace(/9/g, 'o').replace(/8/g, 'l').toUpperCase());
	}
	return this.synckey;
}

FirefoxSyncLink.prototype.getEncryptionKey = function () {
	if (!this.encryptionKey) {
		this.encryptionKey = Crypto.HMAC(Crypto.SHA256,
				this.HMAC_INPUT + this.getUsername() + "\x01",
				Crypto.charenc.Binary.stringToBytes(this.getSyncKey()), {asString: true});
	}
	return this.encryptionKey;
}

FirefoxSyncLink.prototype.getHmacKey = function () {
	if (!this.hmacKey) {
		this.hmacKey = Crypto.HMAC(Crypto.SHA256,
				Crypto.charenc.Binary.stringToBytes(this.getSyncKey()),
				Crypto.charenc.Binary.stringToBytes(this.getEncryptionKey()) + this.HMAC_INPUT + this.getUsername() + "\x02");
	}
	return this.hmacKey;
}

FirefoxSyncLink.prototype.sendRequest = function (path, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', this.server_node_url+'1.0/'+this.getUsername()+path, true);
	xhr.setRequestHeader("Authorization", "Basic "+btoa(this.getUsername()+':'+this.getPassword()));
	xhr.onload  = function () {
		if (xhr.status == 401) throw '401 unauthorized';
		var data = JSON.parse(xhr.responseText);
		callback(data);
	}.bind(this);
	xhr.onerror = function () {
		callback(undefined, xhr);
	}.bind(this);
	xhr.send();
};

// get node, log in
FirefoxSyncLink.prototype.connect = function (callback) {

	var nodeXhr = new XMLHttpRequest();
	// get the node
	nodeXhr.open('GET', 'https://auth.services.mozilla.com/user/1.0/'+this.getUsername()+'/node/weave', true);
	nodeXhr.onload = function () {
		this.server_node_url = nodeXhr.responseText;
		this.sendRequest('/storage/meta/global', function (data) {
				var metadata = JSON.parse(data.payload);
				// check for valid metadata
				if (!metadata) throw 'Failed to load metadata';
				if (metadata.storageVersion != 5) throw 'This client is getting old.';
				this.metadata = metadata;
				this.sendRequest('/storage/crypto/keys', function (data) {
						var keys = JSON.parse(data.payload);
						this.loadKeys(keys);
					}.bind(this));
				callback();
			}.bind(this));
	}.bind(this);
	nodeXhr.send();
};

FirefoxSyncLink.prototype.loadKeys = function (keys) {
	// First, decode the needed properties
	var IV         = atob(keys.IV);
	var ciphertext = atob(keys.ciphertext);
	var hmac       = atob(keys.hmac);
	var bulkKeys = JSON.parse(Weave.Crypto.AES.decrypt(this.getEncryptionKey(), IV, ciphertext));
	if (bulkKeys.id != 'keys' ||
			bulkKeys.collection != 'crypto')
		throw "/storage/crypto/keys object has changed it's structure";
	// should have no keys in it
	for (collection in bulkKeys.collections)
		throw "/storage/crypto/keys contains multiple keys";
	this.defaultKey  = atob(bulkKeys.default[0]);
	this.defaultHMAC = btoa(bulkKeys.default[1]);
}

FirefoxSyncLink.prototype.loadBookmarks = function (callback) {
	// Do first error-checking
	if (!this.metadata.engines.bookmarks)
		throw "Can't sync bookmarks to Firefox Sync (sync Firefox first)'";
	if (this.metadata.engines.bookmarks.version != 2)
		throw "This client is getting old: /storage/meta/global!engines.bookmarks.version != 2";
	// drop state if there was a very big update
	if (localStorage.ffs_state && this.metadata.engines.bookmarks.syncID != localStorage.ffs_state_version) {
		delete localStorage.ffs_state;
		delete localStorage.ffs_state_version;
	}

	this.sendRequest('/storage/bookmarks?full=1', function (encryptedBookmarks) {
			callback(this.parseBookmarks(encryptedBookmarks));
			}.bind(this));
}
FirefoxSyncLink.prototype.parseBookmarks = function (encryptedBookmarks) {
	// First, index all bookmarks by ID
	var idIndexAll = {};
	var encryptedBookmark;
	for (var i=0; encryptedBookmark=encryptedBookmarks[i]; i++) {
		var payload = JSON.parse(encryptedBookmark.payload);
		var ffsBookmark = JSON.parse(Weave.Crypto.AES.decrypt(this.defaultKey,
				atob(payload.IV), atob(payload.ciphertext)));
		if (ffsBookmark.deleted) continue; // ignore them for now
		if (ffsBookmark.hasDupe) continue; // ignore them for now
		if (ffsBookmark.type == 'bookmark') {
			var bookmark = {title: ffsBookmark.title, id: encryptedBookmark.id,
					url: ffsBookmark.bmkUri, parentId: ffsBookmark.parentid};
			if (!bookmark.url) continue;
			idIndexAll[bookmark.id] = bookmark;
		} else if (ffsBookmark.type == 'folder') {
			var folder = {title: ffsBookmark.title, id: encryptedBookmark.id,
					parentId: ffsBookmark.parentid, bm: {}, f: {}};
			if (!folder.title && folder.id != 'places') continue;
			idIndexAll[folder.id] = folder;
		}
	}

	// Now, convert that list to a tree
	var bookmarks = {bm: {}, f: {}, id: 'menu'};
	for (var id in idIndexAll) {
		var node = idIndexAll[id];
		if (!idIndexAll[node.parentId]) continue;
		if (node.parentId == 'menu') {
			node.parentNode = bookmarks;
		} else {
			node.parentNode = idIndexAll[node.parentId];
		}
		if (node.url) {
			this.importBookmark(idIndexAll, node);
		} else {
			this.importFolder(idIndexAll, node);
		}
	}

	// save values
	this.idIndexAll = idIndexAll;
	this.bookmarks  = bookmarks;

	return bookmarks;
};

FirefoxSyncLink.prototype.f_del  =
FirefoxSyncLink.prototype.bm_del = function () {
	// TODO
}

FirefoxSyncLink.prototype.f_mv  =
FirefoxSyncLink.prototype.bm_mv = function () {
	// TODO
}

/*FirefoxSyncLink.prototype.getCollections = function () {
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
};*/

// test whether the engine works
FirefoxSyncLink.prototype.test = function () {
	this.sendRequest('/storage/bookmarks/-UOuT3k7plln', 
		function (success, xhr) {
			console.log(xhr.responseText);
		}.bind(this));
};

if (debug) {
	var ffs = new FirefoxSyncLink();
	console.log('Connecting with Firefox Sync...');
	ffs.connect(function () {
			console.log('Loading bookmarks...');
			ffs.loadBookmarks(function (bookmarks) {
					console.log('Bookmarks loaded:');
					console.log(bookmarks);
				});
		});
}
