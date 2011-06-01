
// prefix: opl (OPera Link

var opl = {};

opl.name = 'Opera Link';
opl.shortname = 'opl';

// imports (or include if you want)
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
	opl.lastSync  = 0;
	opl.actions   = [];
	// local IDs mapped to own bookmark objects, should be deleted after merging
	opl.ids       = {};
	opl.initial_commit = true;

	// start downloading
	opl.updateStatus(statuses.DOWNLOADING);
	opera.link.testAuthorization(opl.authorizationTested);
};

// own loading and parsing has been done, now calculate the last bits before
// submitting it to background.js
opl.finished_start = function () {

	// calculate actions if there is data available
	if (localStorage['opl_state']) {
		try {
			var state = JSON.parse(localStorage['opl_state']);
			opl.calculate_actions(state, opl.bookmarks);
			delete state; // big variable
			if (opl.actions.length) {
				console.log('opl actions:');
				console.log(opl.actions);
			}
		} catch (err) {
			console.log('opl: Error while calculating changes in Opera Link bookmarks:');
			console.error(err);
			console.trace(err);
		}
	}

	// set status to merging
	opl.updateStatus(statuses.MERGING);

	// mark as ready
	target_finished(opl);
	
	// set status to finished
	opl.updateStatus(statuses.READY);
};

// called when sync has been finished.
opl.finished_sync = function () {
	// clean up unused memory
	//delete opl.bookmarks;
	delete opl.ids;
}

opl.save_state = function () {
	console.log('opl: SAVE STATE');
	// maybe this is the wrong place?
	opl.initial_commit = false;

	var state = [];
	opl.get_state(state, g_bookmarks);
	localStorage['opl_state'] = JSON.stringify(state);
}

opl.get_state = function (state, folder) {
	for (url in folder.bm) {
		state.push(folder.bm[url].id+'\n'+folder.bm[url].opl_id);
	}
	for (title in folder.f) {
		// do it here and not at the start of opl.get_state, because the root of
		// Opera Link has no ID.
		var substate = {
				opl_id: folder.f[title].opl_id,
				id: folder.f[title].id,
				children: [],
			};
		state.push(substate);
		opl.get_state(substate.children, folder.f[title]);
	}
}

// @var folder The current folder (represents #state), undefined if this folder
// is deleted (and should be checked for moved items).
opl.calculate_actions = function (state, folder) {
	var state;
	for (var i=0; item=state[i]; i++) {
		// var id:     local (browser) ID
		// var opl_id: opera link ID
		var isfolder = false; // whether this item is a folder
		if (item.id) {
			isfolder = true
			var id = item.id;
			var opl_id = item.opl_id;
		} else {
			var ids = item.split('\n');
			var id = ids[0];
			var opl_id = ids[1];
		}
		if (!folder) {
			// this folder has been deleted, check for items that have been
			// moved outside this folder. Not really needed, but it is better
			// to move folders and bookmarks than to re-create them. (Preserves
			// more data, for example descriptions and favicons).
			if (opl.ids[opl_id]) {
				// this node does still exist, mark it as moved.
				var node = opl.ids[opl_id];
				// TODO get the parentNode ID
			}
		} else {
			// this folder does exist (is most often the case).
			if (!opl.ids[opl_id]){
				if (isfolder) {
					console.log('opl: old f: '+opl_id);

					// first check for folders and bookmarks moved out of this
					// folder.
					opl.calculate_actions(item.children);

					// then remove this bookmark recursively
					opl.actions.push(['f_del',  id]);
				} else {
					console.log('opl: old bm: '+opl_id);
					opl.actions.push(['bm_del', id]);
				}
			} else if (opl.ids[opl_id].parentNode.opl_id != folder.opl_id) {
				console.log('opl: moved: '+opl_id);
			} else {
				// nothing has happened
				if (isfolder) {
					opl.calculate_actions(item.children, opl.ids[opl_id]);
				}
			}
		}
	}
}

opl.disable = function () {
	if (localStorage.opl_state)
		delete localStorage['opl_state'];
	opl.stop();
}

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
			if (item.properties.title == 'Trash' && folder == opl.bookmarks)
				continue; // don't sync trashed bookmarks
			// ??? Isn't this always a duplicate folder name?
			if (folder.f[item.properties.title]) {
				var subfolder = folder.f[item.properties.title];
				if (subfolder.opl_id) {
					// ignore empty
					console.log('FIXME: duplicate folder title: '+
							subfolder.title);

					// if the other is empty, remove it
					if (!has_contents(subfolder)) {
						console.log('has no contents: '+subfolder.title);
						// TODO remove this folder if I'm sure that that
						// won't remove boomkarks.
					} else if (!item.children) {
						console.log('has no childs: '+item.properties.title);
						opera.link.bookmarks.deleteItem(item.id, function(){});
					}
				} else {
					// second folder is more likely to be the wrong (new) folder
					subfolder.opl_id = item.id;
					console.log('NOTICE: something strange has happened here.');
				}
			} else {
				var subfolder = {title: item.properties.title,
						parentNode: folder, bm: {}, f: {}, opl_id: item.id};
				opl.ids[item.id] = subfolder;
				folder.f[subfolder.title] = subfolder;
			}
			if (item.children) {
				opl.parse_bookmarks(item.children, subfolder);
			} else {
				console.log('opl: empty folder: '+subfolder.title);
			}
		} else if (item.item_type == 'bookmark') {
			if (!folder.bm[item.properties.uri]) {
				var bookmark = {parentNode: folder, url: item.properties.uri,
						title: item.properties.title, opl_id: item.id};
				opl.ids[item.id] = bookmark;
				folder.bm[item.properties.uri] = bookmark;
			} else {
				// strange too. Should only be here when there is a duplicate URL.
				bookmark = folder.bm[item.properties.uri];
				if (bookmark.opl_id) {
					console.log('Opera Link: duplicate url: '+bookmark.url);
					// delete this duplicate bookmark.
					// It may be done outside all queues, because this url
					// will not be used anywhere else (it isn't in any tree)
					// FIXME check which is newer and keep it.
					// ignore errors
					opera.link.bookmarks.deleteItem(item.id, function(){});
					continue;
				} else {
					console.log('NOTICE: something strange has happened here.');
				}
				bookmark.opl_id = item.id;
			}
		}
	}
};

// Callbacks for Opera Link
// TODO merge these, because they are nearly the same
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
	console.log('move:');
	console.log(node);
	opl.queue_add(
			function (node) {
				// the parent ID should be an empty string when moving to the root.
				opera.link.bookmarks.move(node.opl_id, node.parentNode.opl_id || '', 'into', opl.itemMoved);
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

