
/* Library for sync targets
 *
 * Link API:
 * init:
 *     initialize this link. Should be called when the extension loads.
 * load:
 *     start the engine. Initializes variables used during sync. Starts the
 *     sync when enabled. Should be called after the browser link has finished
 *     loading.
 * start:
 *     start sync. May only be called when started.
 * stop:
 *     stops sync. May only be called when started.
 *
 * Functions that links should implement:
 * onInit:
 *     called when the extension loads.
 * onUpdateStatus:
 *     called when the status is updated.
 * startSync:
 *     start the sync.
 * stopSync:
 *     stop the sync and clear memory.
 */

function import_link (link, isBrowser) {

	// initialisation of global variables
	if (!isBrowser) {
		webLinks.push(link);

	}

	// should be called only once
	link.init = function () {
		link.started = false;
		link.enabled = false;//JSON.parse(localStorage[link.id+'_enabled']);
		if (link.onInit) {
			link.onInit(); // should also be called only once
		}
	}

	link.load = function () {
		link.status = statuses.READY; // only to initialize
		link.loaded = true;

		if (localStorage[link.id+'_lastSyncTime']) {
			link.lastSyncTime = JSON.parse(localStorage[link.id]);
		} else {
			link.lastSyncTime = 0;
		}

		// get the current time in seconds, with the precision of milliseconds.
		link.startSyncTime = (new Date()).getTime()/1000;

		// load enabled/disabled state
		if (localStorage[link.id+'_enabled']) {
			link.enabled = JSON.parse(localStorage[link.id+'_enabled']);
		} else {
			link.enabled = false;
		}

		// start if enabled
		if (link.enabled) {
			// disable it first and then re-enable it in link.start
			link.enabled = false;
			link.start();
		}

	};

	// Start the link
	// @var force Force this link to start, also when it is already started
	link.start = function (restart) {
		// link should first be loaded
		if (!link.loaded && link != browser) { // browser doesn't need loading
			console.error('link '+link.id+' started when it was not initialized');
			return;
		}

		if (link.enabled) {
			if (!restart) return;
		} else {
			// mark enabled
			link.enabled = true;
			localStorage[link.id+'_enabled'] = JSON.stringify(true);

			if (link != browser) {
				enabledWebLinks.push(link);
			}

			// whether this link needs extra url/tag indices
			if (link.flag_tagStructure && !link.flag_treeStructure) {
				tagtree.addLink(link);
			}
		}

		if (link.status) {
			console.error('BUG: '+link.id+'.startSync called while link is busy (status is non-zero)');
			return;
		}

		// now start the link. Should be done when it is enabled
		link._startSync();
	};

	link._startSync = function () {
		// first, initialize the link

		link.bookmarks = {bm: {}, f: {}};
		if (link.bookmarksRootId) {
			if (link == browser) {
				link.bookmarks.id = link.bookmarksRootId;
			} else {
				link.bookmarks[link.id+'_id'] = link.bookmarksRootId;
			}
		}
		if (link.bookmarksRootTitle) {
			link.bookmarks.title = link.bookmarksRootTitle;
		}

		if (link.flag_treeStructure) {
			// local IDs mapped to own bookmark objects, should be deleted after merging
			link.ids = {};
			link.ids[link.bookmarks.id] = link.bookmarks;
		}

		if (link.flag_tagStructure) {
			link.rootNodeLabel = localStorage[link.id+'_rootNodeLabel'] || 'Bookmarks Bar';
			link.folderSep     = localStorage[link.id+'_folderSep']     || '/';
			link.changed = {}; // marked to be uploaded
			link.tags    = {};
		}

		// only for webLinks:
		if (link != browser) {
			link.actions = [];
		}

		// now start the link
		link.startSync();
	}

	link.msg_restart = function () {
		link.start(true);
	}

	link.parsingFinished = function () {
		if (localStorage[link.id+'_state']) {
			// load saved status
			var state = JSON.parse(localStorage[link.id+'_state']);

			// for tree-based bookmark systems
			if (link.flag_treeStructure) {
				// map link-specific IDs to local browser IDs.
				// WARNING: when the link_id is not known, this will give strange
				// behaviour (when a moved bookmark or folder moves to the
				// bookmarks root)
				link.ownId_to_lId = {undefined: browser.bookmarks.id};
				link.mapLinkIdsToLocalIds(state);
			}

			// now calculate the actions once all data has been loaded.
			link.calculate_actions(state, link.bookmarks);

			// display message when there are actions
			if (link.actions.length) {
				console.log(link.id+'.actions:');
				console.log(link.actions);
			}

			// delete unused variables
			delete state; // big variable (44KB with my bookmarks in JSON)
		}

		// start merging
		link_finished(link);
	}

	// Stop link. remove memory-eating status if the keepStatus flag is not set.
	link.stop = link.msg_stop = function (keepStatus) {
		localStorage[link.id+'_enabled'] = JSON.stringify(false);
		link.enabled = false;
		if (link != browser) {
			Array_remove(enabledWebLinks, link);
		}
		// check whether this link has finished after starting. It is possible
		// that there's an error while it starts, and that it disables itself.
		if (finishedLinks.indexOf(link) >= 0) {
			Array_remove(finishedLinks, link);
		}

		// whether this link needs extra url/tag indices
		if (link.flag_tagStructure && !link.flag_treeStructure) {
			tagtree.removeLink(link);
		}

		if (!keepStatus) {
			delete localStorage[link.id+'_state'];
		}

		link.updateStatus(statuses.READY);
	};

	link.commit = function () {
		console.warn(link.id+' commit -- backtrace:');
		console.trace();
		link.queue_start(); // start running
	}

	link.may_save_state = function () {
		if (browser.queue.running ||
			link.has_saved_state ||
			link.status ||
			!link.save_state) {
			return;
		}

		if ((link.queue || link.r_queue).running) {
			console.warn(link.id+': Queue is running but status is zero!');
			console.log(link);
			return; // will be started when the queue is empty
		}

		link.has_saved_state = true;

		console.log(link.id+': saving state:');
		console.trace();
		link.save_state();
	};

	link.updateStatus = function (status) {
		// ??? to use my object (this), I have to use 'link' instead of 'this'.
		if (status !== undefined) {
			link.status = status;
		}
		if (link == browser) return; // not in popup

		if (link.onUpdateStatus) {
			link.onUpdateStatus(status !== undefined);
		}

		if (!isPopupOpen) return;

		// make make human-readable message
		var msgtext = 'Not synchronized';
		if (link.enabled) {
			if (link.status == statuses.READY) {
				msgtext = 'Synchronized';
			} else if (link.status == statuses.AUTHORIZING) {
				msgtext = 'Authorizing...';
			} else if (link.status == statuses.DOWNLOADING) {
				msgtext = 'Downloading...';
			} else if (link.status == statuses.PARSING) {
				msgtext = 'Parsing bookmarks data...';
			} else if (link.status == statuses.MERGING) {
				msgtext = 'Syncing...';
			} else if (link.status == statuses.UPLOADING) {
				msgtext = 'Uploading ('+((link.queue||link.r_queue).length+1)+' left)...';
			} else {
				msgtext = 'Enabled, but unknown status (BUG! status='+link.status+')';
			}
		}
		var btn_start = !link.enabled || !link.status && link.enabled;
		var btn_stop  = link.enabled && !link.status;

		var message = {action: 'updateUi', id: link.id, message: msgtext, btn_start: btn_start, btn_stop: btn_stop};

		// send message to specific browsers
		if (browser.name == 'chrome') {
			chrome.extension.sendRequest(message, function () {});
		} else if (browser.name == 'firefox') {
			browser.popupDOM.getElementById('sync2all-'+link.id+'-status').value = msgtext;
			browser.popupDOM.getElementById('sync2all-'+link.id+'-button-start').disabled = !btn_start;
			browser.popupDOM.getElementById('sync2all-'+link.id+'-button-stop').disabled  = !btn_stop;
		} else if (browser.name == 'opera') {
			opera.extension.broadcastMessage(message);
		}
	}

	link.mark_state_deleted = function (state) {

		// remove the subfolders first
		var title;
		for (title in state.f) {
			var substate = state.f[title];
			this.mark_state_deleted(substate);
		}

		// then remove the bookmarks
		// Otherwise, non-empty folders will be removed
		for (var i=0; data=state.bm[i]; i++) {

			var id, url;
			data = data.split('\n');
			id = data[0]; url = data[1];

			// this bookmark has been removed
			console.log('Bookmark deleted: '+url);
			this.actions.push(['bm_del', id]);
		}

		// remove the parent folder when the contents has been deletet
		this.actions.push(['f_del_ifempty', state.id]); // clean up empty folders
	}

	// import bookmark into own tree, thereby cleaning up duplicates etc.
	link.importBookmark = function (bookmark) {
		// this is the folder where the bookmark is in.
		var parentNode = bookmark.parentNode;

		// check for invalid bookmark
		if (!bookmark.url)
			return true; // invalid, not added

		// check for duplicate
		if (parentNode.bm[bookmark.url]) {
			console.log('DUPLICATE: '+bookmark.url);
			console.log(bookmark);

			// this bookmark does already exist, take the latest.
			var otherBookmark = parentNode.bm[bookmark.url];

			if (otherBookmark.mtime > bookmark.mtime) {
				// otherBookmark is the latest added, so remove this bookmark
				link.bm_del(link, bookmark);
				// other bookmark is already added to the tree
				return true; // invalid bookmark
			} else {
				// this bookmark is the newest, remove the other
				link.bm_del(link, otherBookmark);
				parentNode.bm[bookmark.url] = bookmark; // replace the other bookmark
			}

		} else {
			// no duplicate, so just add
			parentNode.bm[bookmark.url] = bookmark;
		}

		// add bookmark ID
		if (link == browser) {
			link.ids[bookmark.id] = bookmark;
		} else {
			link.ids[bookmark[link.id+'_id']] = bookmark;
		}
	}

	// import a single-url, tagged bookmark (without a tree)
	// I'm not very happy with this name, but couldn't find a better one
	link.importUrlBookmark = function (uBm) {
		if (!tagtree.urls[uBm.url]) {
			// new bookmark (only sometimes the case)
			tagtree.urls[uBm.url] = {gbm_id: uBm.id, url: uBm.url, bm: []}
		} else {
			// bookmark does already exist (most often the case)
			tagtree.urls[uBm.url].gbm_id = uBm.id;
		}

		for (var tagIndex=0; tagIndex<uBm.tags.length; tagIndex++) {
			var tag = uBm.tags[tagIndex];
			var parentNode = undefined;
			if (tag == link.rootNodeLabel) {
				parentNode = link.bookmarks;
			} else {
				if (!link.tags[tag]) {
					// Add the new folder to the list
					var folderNameList = tag.split(link.folderSep);
					parentNode = link.bookmarks;
					var folderNameList;
					for (var folderNameIndex=0; folderName=folderNameList[folderNameIndex]; folderNameIndex++) {
						// is this a new directory?
						if (parentNode.f[folderName] == undefined) {
							// yes, create it first
							parentNode.f[folderName] = {bm: {}, f: {}, title: folderName,
								parentNode: parentNode};
						}
						// parentNode does exist
						parentNode = parentNode.f[folderName];
					}
					link.tags[tag] = parentNode;
				} else {
					parentNode = link.tags[tag];
				}
			}
			var bookmark = {url: uBm.url, title: uBm.title, parentNode: parentNode,
				mtime: uBm.mtime};
			parentNode.bm[bookmark.url] = bookmark;
		}
		if (!uBm.tags.length) {
			// this bookmark has no labels, add it to root
			var bookmark = {url: uBm.url, title: uBm.title, parentNode: link.bookmarks,
				mtime: uBm.mtime};
			link.bookmarks.bm[bookmark.url] = bookmark;
		}
	}

	// import folder, cleans up duplicates too
	link.importFolder = function (folder) {
		var parentNode = folder.parentNode;

		// ignore folders without a title
		if (folder.title === '') {
			return;
		}

		// check for duplicates
		if (parentNode.f[folder.title]) {
			// duplicate folder, merge the contents
			console.log('DUPLICATE FOLDER: '+folder.title);
			console.log(folder);

			// get the other folder of which this is a duplicate
			var otherFolder = parentNode.f[folder.title];
			// move the contents of this folder to the other folder
			// FIXME check for duplicates (by using importFolder and importBookmark)
			var title; // first the subfolders
			for (title in folder.f) {
				var subFolder = folder.f[title];
				_mvFolder(subFolder, otherFolder);
				link.f_mv(link, subFolder, folder);
			}
			var url; // now move the bookmarks
			for (url in folder.bm) {
				// get bookmark
				var bookmark = folder.bm[url];
				// move bookmark
				bookmark.parentNode = otherFolder;
				delete folder.bm[bookmark.url];
				link.importBookmark(bookmark);
				// move bookmark on web storage / in the browser
				link.bm_mv(link, bookmark, folder);
			}

			// now delete this folder. This removes it's contents too!
			// But that should not be a problem, as the contents has already
			// been moved.
			link.f_del(link, folder);
		}

		// merge it in the tree
		parentNode.f[folder.title] = folder;

		// add folder ID
		if (link == browser) {
			link.ids[folder.id] = folder;
		} else {
			link.ids[folder[link.id+'_id']] = folder;
		}
	}

	link.onRequest = function (request, sender, sendResponse) {
		// handle request
		if (request.action.substr(0, link.id.length+1) == link.id+'_') {

			// convert linkid_action to msg_action
			link['msg_'+request.action.substr(request.action.indexOf('_')+1)](request, sender);
		}
	}
	if (browser.name == 'chrome') {
		chrome.extension.onRequest.addListener(link.onRequest);
	} else if (browser.name == 'firefox') {
	}

	/* Errors */

	link.errorStarting = function (msg) {
		console.log(msg);
		console.log(link.name+' will now be disabled');
		link.stop();
	}

};


function import_queue (obj) {

	/* variables */

	obj.queue = [];
	obj.queue.id = Math.random();


	/* functions */


	// add a function to the queue
	obj.queue_add = function (callback, data) {
		this.queue.push([callback, data]);
	};

	// start walking through the queue if it isn't already started
	obj.queue_start = function () {
		if (this.queue.running) {
			console.warn('Queue is already running! '+this.queue.id+this.queue.running);
			return;
		}
		this.updateStatus(statuses.UPLOADING);
		this.queue.running = true;
		this.queue_next();
	};

	// execute the next function in the queue
	obj.queue_next = function () {
		try {
			var queue_item = this.queue.shift();
			if (!queue_item) {

				// queue has finished!
				this.queue_stop();

				// don't go further
				return;
			}

			// send amount of lasting uploads to the popup
			this.updateStatus(statuses.UPLOADING);

			var callback = queue_item[0];
			var data     = queue_item[1];
			callback(data);
		} catch (err) {
			console.error('queue_next');
			console.trace();
			throw (err);
		}

	};

	obj.queue_stop = function () {
		// queue has been finished!!!
		this.queue.running = false;
		this.queue.length = 0; // for when the queue has been forced to stop, clear the queue

		this.updateStatus(statuses.READY);
		console.log(this.name+' has finished the queue!!! '+this.queue.id+this.queue.running);

		// save current state when everything has been uploaded
		// this occurs also when there is nothing in the queue when the
		// first commit happens.
		this.may_save_state();

		// if this is the browser
		if (this == browser) {
			// save all states when they are ready
			//broadcastMessage('may_save_state');
		}
	};
	obj.queue_error = function () {
		// disable link on error
		this.queue_stop();
		this.stop();
	}
}

/** Called when something has been moved. This is an utility function for
 * browser objects.
 */
function move_event (link, id, oldParentId, newParentId) {
	// get info
	var node      = link.ids[id];
	var oldParent = link.ids[oldParentId];
	var newParent = link.ids[newParentId];

	// if the bookmark has been moved by Sync2all, ignore this event
	if (node && newParent && node.parentNode == newParent) {
		return;
	}

	// if node is moved to outside synced folder
	if (!newParent) {
		// if the node comes from outside the synced folder
		if (!oldParent) {
			if (!node) {
				console.log('Bookmark/folder outside synchronized folder moved. Ignoring.');
				return;
			} else {
				console.log('BUG: only the node is known, not the rest \
						(including the parent!)');
				return;
			}
		} else { // the 'else' is not really needed
			if (!node) {
				console.log('BUG: only the old parent is known, not the node \
						nor the new parent');
				return;
			} else {
				// newParent is not known, node and oldParent are known.
				console.log('Move: new parent not found. Thus this bookmark/folder is \
						moved to outside the synced folder.');

				// remove the node
				delete link.ids[node.id];
				rmNode(link, node); // parent needed for bookmarks
				commit()
				return;
			}
		}
	} else {
		// the node is moved to inside the synced folder
		if (!node) {
			// the node is moved from outside the synced folder to therein.
			if (!oldParent) { // check it twice, should also be undefined.

				console.log('Move: node id and oldParent not found. I assume this \
bookmark comes from outside the synchronized tree. So doing a crete now');
				link.import_node(id);
				commit();
				return;
			} else {
				console.log('BUG: the node is not known, but the old parent \
						and the new parent are.');
				return;
			}
		} else {
			if (!oldParent) {
				console.log('BUG: only the old parent is not known. The node \
						and the new parent are.');
				return;
			} else {
				// the bookmark has been moved within the synced folder tree.
				// Nothing strange has happened.
			}
		}
	}

	// newParent, node and oldParent are 'defined' variables. (i.e. not
	// 'undefined').

	if (newParent == oldParent) {
		// node moved inside folder (so nothing has happened, don't know
		// whether this is really needed, Chrome might catch this).
		return;
	}

	
	// Bookmark is moved inside synced folder.

	node.parentNode = newParent;

	if (node.url) {
		// bookmark
		console.log('Moved '+node.url+' from '+(oldParent?oldParent.title:'somewhere in the Other Bookmarks menu')+' to '+newParent.title);
		newParent.bm[node.url] = node;
		delete oldParent.bm[node.url];
		broadcastMessage('bm_mv', link, [node, oldParent]);
	} else {
		// folder
		if (newParent.f[node.title]) {
			console.log('FIXME: duplicate folder overwritten (WILL FAIL AT SOME POINT!!!)');
		}
		newParent.f[node.title] = node;
		delete oldParent.f[node.title];
		broadcastMessage('f_mv', link, [node, oldParent]);
	}
	commit();
}

