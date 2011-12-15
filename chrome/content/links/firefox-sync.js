
// prefix: ffs_

ffs = {};

ffs.name = 'Firefox Sync';
ffs.id = 'ffs';

ffs.email    = localStorage.ffs_email;
ffs.password = localStorage.ffs_password;
// the username is base32(sha1(email))'d
ffs.username = baseenc.b32encode(str_sha1(ffs.email)).toLowerCase();

ffs.getpwd = function () {
	if (ffs.password) return ffs.password;
	ffs.password = prompt('Password:');
	localStorage["ffs_password"] = ffs.password;
	return ffs.password;
};

ffs.start = function () {

	// log in
	var xhr = new XMLHttpRequest();

	// get the node
	xhr.open('GET', 'https://auth.services.mozilla.com/user/1.0/'+ffs.username+'/node/weave', true);
	xhr.onload = function () {
		ffs.server_node_url = xhr.responseText;
		ffs.getCollections();
	}
	xhr.send();
};

ffs.sendRequest = function (path, callback) {
	xhr = new XMLHttpRequest();
	xhr.open('GET', ffs.server_node_url+'1.0/'+ffs.username+path, true);
	xhr.setRequestHeader("Authorization", "Basic "+btoa(ffs.username+':'+ffs.getpwd()));
	xhr.onload  = function () {
		callback(true, xhr);
	}
	xhr.onerror = function () {
		callback(false, xhr);
	}
	xhr.send();
};

ffs.getCollections = function () {
	ffs.sendRequest ('/info/collections',
			function (success, xhr) {
				if (!success) {
					console.error('Failed to load collection timestamps:');
					console.log(xhr);
					return;
				}
				ffs.collection_mtimes = JSON.parse(xhr.responseText);
				ffs.getKeys();
			});
};

ffs.getKeys = function () {
	ffs.sendRequest('/storage/key?full=1', ffs.getKeys_callback);
};

ffs.getKeys_callback = function (success, xhr) {
	if (!success) {
		console.error('Failed to get keys:');
		console.log(xhr);
		return;
	}
	var keys = JSON.parse(xhr.responseText);
	console.log(keys);

	// I hope this is a bit future-proof, but I doubt it...
	ffs.privkey_data = JSON.parse(keys[0].payload);
	ffs.pubkey_data = JSON.parse(keys[1].payload);
};

// test whether the engine works
ffs.test = function () {
	ffs.sendRequest('/storage/bookmarks/-UOuT3k7plln', 
		function (success, xhr) {
			console.log(xhr.responseText);
		});
};


if (debug) {
	ffs.start();
}
