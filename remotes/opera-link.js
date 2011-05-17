
// prefix: opl (OPera Link

var opl = {};

opl.name = 'Opera Link';
opl.shortname = 'opl';

// imports
use_target(opl);
use_queue(opl);

var oauth;

// fix opera.link for Google Chrome
opera.link.authorizeFunction = function (url) {
	chrome.tabs.create({url: url});
}

opl.init = function () {
	// initialize opera.link
	opera.link.consumer("immqSD074yPY83JWSKAzmjUUpOcC7u40", "RmLYnd49QRcDW89rCUkPgmBuTmkTfse6");
	opera.link.loadToken();

	opl.enabled = localStorage['opl_enabled'];
	opl.status = statuses.READY;

	opl.authorized = false;

	// start if enabled
	if (opl.enabled) {
		remotes_enabled.push(opl);
		opl.start();
	}
}

opl.start = function () {

	opl.updateStatus(statuses.DOWNLOADING);

	// mark enabled
	if (!opl.enabled) {
		localStorage.opl_enabled = true;
		opl.enabled = true;
		remotes_enabled.push(opl);
	}

	// initialize variables
	opl.bookmarks = {bm: {}, f: {}}; // doesn't have a title, only childrens
	opl.lastSync = 0;

	// start downloading
	opl.updateStatus(statuses.DOWNLOADING);
	opera.link.testAuthorization(opl.authorizationTested);
};

opl.finished_start = function () {
	// set status to merging
	opl.updateStatus(statuses.MERGING);

	// mark as ready
	target_finished(opl);
	
	// set status to finished
	opl.updateStatus(statuses.READY);
};

opl.stop = function () {
	if (!opl.enabled || opl.status) {
		return; // FIXME error handling
	}

	delete localStorage.opl_enabled;
	opl.enabled = false;
	remotes_enabled.remove(opl);

	opl.updateStatus(statuses.READY);
}

opl.requestTokenCallback = function (e) {
	// save temporary tokens tokens
	opl.requestToken = e.token;
	opl.requestTokenSecret = e.secret;

	// listen to the verifier from the content script
	chrome.extension.onRequest.addListener(opl.onRequest);
};

opl.onRequest = function (request, sender, sendResponse) {
	// handle request
	console.log(request);
	if (request.action != 'opl_verifier') return;
	sendResponse({}); // Mark this as being received.
	opl.onVerifier(request);
};

opl.onVerifier = function (request) {

	if (opl.authorized) return; // strange

	var verifier = request.verifier;
	if (!verifier) { // check for validity
		opl.status = statuses.READY;
		opl.stop();
		return;
	}

	// use verifier
	opera.link.getAccessToken(opl.requestToken, opl.requestTokenSecret, verifier, opl.accessTokenCallback, opl.accessTokenError);
};

opl.requestTokenError = function (e) {
	// report error
	console.log('error getting request token:');
	console.log(e);
	console.log('Old tokens have been removed, so you might want to try again.');
	alert('There was an error while connecting to Opera Link. See the log for details.\n\nOpera Link is now disabled.');
	
	// remove possibly bad tokens
	delete localStorage.oauth_token;
	delete localStorage.oauth_secret;

	// disable Opera Link
	opl.status = statuses.READY;
	opl.stop();
};

opl.accessTokenCallback = function (e) {
	opera.link.saveToken();
	opl.authorized = true;
	opl.loadBookmarks();
};

opl.accessTokenError = function (e) {
	console.log('error getting access token:');
	console.log(e);
	alert('There was an error while connecting to Opera Link. See the log for details.');
};

opl.authorizationTested = function (authorized) {
	if (authorized) {
		opl.authorized = true;
		opl.loadBookmarks();
	} else {
		// authorize now
		opera.link.requestToken(opl.requestTokenCallback, opl.requestTokenError);
	}
};

opl.loadBookmarks = function () {
	opera.link.bookmarks.getAll(opl.bookmarksLoaded);
};

opl.bookmarksLoaded = function (result) {
	opl.parse_bookmarks(result.response, opl.bookmarks);
	opl.finished_start();
};

opl.parse_bookmarks = function (array, folder) {
	var item;
	for (var i=0; item=array[i]; i++) {
		if (item.item_type == 'bookmark_folder') {
			if (item.properties.title == 'Trash' && folder == opl.bookmarks) continue; // don't sync trashed bookmarks
			if (folder.f[item.properties.title]) {
				var subfolder = folder.f[item.properties.title];
				if (subfolder.opl_id) {
					console.log('FIXME: duplicate folder title: '+subfolder.title);
				}
				subfolder.opl_id = item.id;
			} else {
				var subfolder = {title: item.properties.title, parentNode: folder, bm: {}, f: {}, opl_id: item.id};
				folder.f[subfolder.title] = subfolder;
			}
			if (item.children) {
				opl.parse_bookmarks(item.children, subfolder);
			} else {
				console.log('empty folder: '+subfolder.title);
			}
		} else if (item.item_type == 'bookmark') {
			if (!folder.bm[item.properties.uri]) {
				var bookmark = {parentNode: folder, url: item.properties.uri, title: item.properties.title, opl_id: item.id};
				folder.bm[item.properties.uri] = bookmark;
			} else {
				bookmark = folder.bm[item.properties.uri];
				if (bookmark.opl_id) {
					console.log('FIXME: duplicate url: '+bookmark.url);
				}
				bookmark.opl_id = item.id;
			}
		}
	}
};

// Callbacks for Opera Link
// TODO merge these
opl.itemCreated = function (result) {
	if (result.status != 200) {
		console.log('ERROR creating bookmark/folder:');
		console.log(result);
		return;
	}
	opl.current_item.opl_id = result.response.id;
	opl.queue_next();
};
opl.itemDeleted = function (result) {
	if (!result.status == 204) {
		console.log('ERROR deleting:');
		console.log(result);
		return;
	}
	opl.queue_next();
};
opl.itemMoved = function (result) {
	if (!result.status == 200) {
		console.log('ERROR moving:');
		console.log(result);
		return;
	}
	opl.queue_next();
};
opl.itemUpdated = function (result) {
	if (!result.status == 200) {
		console.log('ERROR updating:');
		console.log(result);
		return;
	}
	opl.queue_next();
};


opl.bm_add = function (target, bm, folder) {
	if (!folder) var folder = bm.parentNode;
	opl.queue_add(
			function (bm) {
				if (!folder.opl_id && folder != g_bookmarks) {
					console.log('No parent ID! Bookmark:');
					console.log(bm);
					opl.queue_next();
					return;
				}
				opl.current_item = bm;
				// TODO: last visited timestamp, comments (from Google Bookmarks)
				opera.link.bookmarks.create({title: bm.title, uri: bm.url}, folder.opl_id, opl.itemCreated); //, created: timestamp(new Date(bm.timestamp))
			}, bm);
}

opl.f_add = function (target, folder) {
	opl.queue_add(function (folder) {
				if (!folder.parentNode.opl_id && folder.parentNode != g_bookmarks) {
					console.log('No parent ID! Folder:');
					console.log(folder);
					return;
				}
				opl.current_item = folder;
				opera.link.bookmarks.createFolder({title: folder.title}, folder.parentNode.opl_id, opl.itemCreated);
			}, folder);
}

opl.bm_del = opl.f_del = function (target, node) {
	opl.queue_add(
			function (node) {
				opera.link.bookmarks.deleteItem(node.opl_id, opl.itemDeleted);
			}, node);
}

opl.bm_mv = opl.f_mv = function (target, node, oldParent) {
	opl.queue_add(
			function (node) {
				opera.link.bookmarks.move(node.opl_id, node.parentNode.opl_id, 'into', opl.itemMoved);
			}, node);
};

opl.f_mod_title = opl.f_mod_url = function (target, node, oldtitle) {
	opl.sendChanges(node.opl_id, {title: node.title});
}

opl.sendChanges = function (node, changes) {
	opl.queue_add(
			function (node) {
				opera.link.bookmarks.update(node.opl_id, changes, opl.itemUpdated);
			}, node);
}

opl.commit = function () {
	opl.queue_start(); // start running
}

