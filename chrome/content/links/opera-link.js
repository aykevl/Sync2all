
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

opl.start = opl.msg_start = function () {

	opl.updateStatus(statuses.AUTHORIZING);

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
	opera.link.testAuthorization(opl.authorizationTested);
};

// own loading and parsing has been done, now calculate the last bits before
// submitting it to background.js
opl.finished_start = function () {

	// calculate actions if there is data available
	if (localStorage['opl_state']) {
		// this may fail with an update, so ignore (dump) the errors, and just
		// save a new status after this sync.
		//try {
			// load saved status
			var state = JSON.parse(localStorage['opl_state']);

			// map Opera Link IDs to local browser IDs.
			// WARNING: when the opl_id is not known, this will give strange
			// behaviour (when a moved bookmark or folder moves to the
			// bookmarks root)
			opl.ownId_to_lId = {undefined: g_bookmarks.id};
			opl.mapOplIdsToLocalIds(state);

			// now calculate the actions once all data has been loaded.
			opl.calculate_actions(state, opl.bookmarks);

			// delete unused variables
			delete state; // big variable (44KB with my bookmarks in JSON)
			//delete opl.ownId_to_lId;

			// display message when there are actions
			if (opl.actions.length) {
				console.log('opl actions:');
				console.log(opl.actions);
			}
		/*} catch (err) {
			console.log('opl: Error while calculating changes in Opera Link bookmarks:');
			console.error(err);
			console.trace(err);
		}*/
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
	console.log('opl: saving state');
	// maybe this is the wrong place?
	opl.initial_commit = false;

	var state = [];
	opl.get_state(state, g_bookmarks);
	localStorage['opl_state'] = JSON.stringify(state);
}

opl.get_state = function (state, folder) {
	for (url in folder.bm) {
		state.push({id: folder.bm[url].id, opl_id: folder.bm[url].opl_id});
	}
	for (title in folder.f) {
		// do it here and not at the start of opl.get_state, because the root of
		// Opera Link has no ID.
		var substate = {
				opl_id: folder.f[title].opl_id,
				id: folder.f[title].id,
				children: [], // folders should always have children
			};
		state.push(substate);
		opl.get_state(substate.children, folder.f[title]);
	}
}

opl.mapOplIdsToLocalIds = function (state) {
	var item;
	for (var i=0; item=state[i]; i++) {
		opl.ownId_to_lId[item.opl_id] = item.id;

		// if this node has children (that means this is a folder).
		if (item.children) {
			opl.mapOplIdsToLocalIds(item.children);
		}
	}
}

opl.make_stable_lId = function (node) {
	var sid = [];
	while (node) {
		sid.push([opl.ownId_to_lId[node.opl_id], node.url?node.url:node.title]);
		node = node.parentNode;
	}
	return sid;
};

// @var folder The current folder (represents #state), undefined if this folder
// is deleted (and should be checked for moved items).
// @var state The array of children of this folder.
opl.calculate_actions = function (state, folder) {
	var state;
	var item;

	/* check for created folders
	 * This must be checked before the moved folders, otherwise the nodes will
	 * be moved to non-existing folders (that gives an error).
	 */
	
	/*// make an key/value array of the state
	var opl_ids = {};
	for (var i=0; item=state[i]; i++) {
		opl_ids[item.opl_id] = item;
	}

	// check for added folders.
	var subfolder;
	for (var title in folder.f) {
		subfolder = folder.f[title];
		if (!opl_ids[subfolder.opl_id]) {
			console.log('New folder: '+subfolder.title);
			actions.push('f_new', subfolder);
		}
	}*/

	/* check for removed and moved items */

	for (var i=0; item=state[i]; i++) {

		var isfolder = false; // whether this item is a folder

		// folders have always children (unlike Opera Link);
		if (item.children) {
			isfolder = true
		}

		if (!folder) {
			// this folder has been deleted, check for items that have been
			// moved outside this folder. Not really needed, but it is better
			// to move folders and bookmarks than to re-create them. (Preserves
			// more data, for example descriptions and favicons).
			if (opl.ids[item.opl_id]) {
				// this node does still exist, mark it as moved.
				var node = opl.ids[item.opl_id];

				if (node.url) { // if this is a bookmark
					opl.actions.push(['bm_mv', item.id, opl.ownId_to_lId[node.parentNode.opl_id]]);
				} else {
					opl.actions.push(['f_mv',  item.id, opl.ownId_to_lId[node.parentNode.opl_id]]);
				}
			} else {
				// node doesn't exist, remove it.
				if (isfolder) {
					opl.calculate_actions(item.children, undefined);
					if (item.id && current_browser.ids[item.id]) {
						current_browser.ids[item.id].opl_id = item.opl_id;
						opl.actions.push(['f_del_ifempty',  item.id]);
					}
				} else {
					// check whether the bookmark still exists
					if (current_browser.ids[item.id]) {
						current_browser.ids[item.id].opl_id = item.opl_id;
						opl.actions.push(['bm_del', item.id]);
					}
				}
			}
		} else {
			// this folder does exist (is most often the case).
			if (!opl.ids[item.opl_id]){
				if (isfolder) {
					console.log('opl: old f: '+item.opl_id);

					// first check for folders and bookmarks moved out of this
					// folder.
					opl.calculate_actions(item.children, undefined);

					// then remove this folder
					// but check first whether the folder actually exists
					if (item.id && current_browser.ids[item.id]) {
						current_browser.ids[item.id].opl_id = item.opl_id;
						opl.actions.push(['f_del_ifempty',  item.id]);
					}
				} else {
					// check whether the bookmark still exists.
					if (current_browser.ids[item.id]) {
						console.log('opl: old bm: '+item.opl_id);
						current_browser.ids[item.id].opl_id = item.opl_id;
						opl.actions.push(['bm_del', item.id]);
					}
				}

			} else if (opl.ids[item.opl_id].parentNode.opl_id != folder.opl_id) {
				var movedTo = opl.ids[item.opl_id].parentNode;

				// useful information for debugging
				console.log('opl: moved: '+item.opl_id);
				console.log(item);
				console.log(movedTo);

				// get stable ID
				var stableToId = opl.make_stable_lId(movedTo);

				// add type-specifc information
				if (isfolder) {
					opl.actions.push(['f_mv',  item.id, stableToId]);
					// search for changes within this folder
					opl.calculate_actions(item.children, opl.ids[item.opl_id]);
				} else {
					opl.actions.push(['bm_mv', item.id, stableToId]);
				}

			} else {
				// nothing has happened, search recursively for changes.
				if (isfolder) {
					opl.calculate_actions(item.children, opl.ids[item.opl_id]);
				}
			}
		}
	}
}

opl.msg_disable = opl.disable = function () {
	if (localStorage.opl_state)
		delete localStorage['opl_state'];
	opl.stop();
}

opl.msg_stop = opl.stop = function () {
	if (!opl.enabled || opl.status) {
		return; // FIXME error handling
	}

	delete localStorage.opl_enabled;
	opl.enabled = false;
	Array_remove(remotes_enabled, opl);

	opl.updateStatus(statuses.READY);
}

opl.requestTokenCallback = function (e) {
	// save temporary tokens tokens
	opl.requestToken = e.token;
	opl.requestTokenSecret = e.secret;

	// listen to the verifier from the content script
	chrome.extension.onRequest.addListener(opl.onRequest);
};


opl.msg_verifier = function (request) {

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
	opl.updateStatus(statuses.DOWNLOADING);
	opera.link.bookmarks.getAll(opl.bookmarksLoaded);
};

opl.bookmarksLoaded = function (result) {
	opl.updateStatus(statuses.PARSING);
	opl.parse_bookmarks(result.response, opl.bookmarks);
	opl.finished_start();
};

opl.parse_bookmarks = function (array, folder) {
	var item;
	for (var i=0; item=array[i]; i++) {
		if (item.item_type == 'bookmark_folder') {
			// is this a valid folder?
			if (!item.properties.title) {
				// bogus folder, Opera Link has sometimes strange quirks...
				// Ignore this folder.
				continue;
			}

			// is this the trash?
			if (item.properties.title == 'Trash' && folder == opl.bookmarks) {
				// yes, ignore
				continue; // don't sync trashed bookmarks
			}

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
			// check whether this is a valid bookmark
			if (!item.properties.uri || !item.properties.title) {
				// this is a bogus bookmark. Ignore it before errors arise.
				console.log('opl: bogus bookmark:');
				console.log(item);
				continue;
			}
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
	if (!node.opl_id) {
		console.log(node);
		throw 'No opl_id in bookmark node';
	}
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

