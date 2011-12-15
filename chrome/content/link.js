
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
		link.enabled = JSON.parse(localStorage[link.id+'_enabled']);

		// start if enabled
		if (link.enabled) {
			enabledWebLinks.push(link);
			link.startSync();
		}

	};

	link.start = function (restart) {
		// this function doesn't apply when this is a browser link
		if (link == browser) return;

		// link should first be loaded
		if (!link.loaded) return;

		if (link.enabled) {
			if (!restart) return;
		} else {
			// mark enabled
			link.enabled = true;
			localStorage[link.id+'_enabled'] = JSON.stringify(true);

			enabledWebLinks.push(link);
		}

		// now start the link. Should be done when it is enabled
		link.startSync();
	};

	link.msg_restart = function () {
		link.start(true);
	}

	// Stop link. remove memory-eating status if the keepStatus flag is not set.
	link.stop = link.msg_stop = function (keepStatus) {
		localStorage[link.id+'_enabled'] = JSON.stringify(false);
		link.enabled = false;
		if (link != browser) {
			Array_remove(enabledWebLinks, link);
		}
		Array_remove(finishedLinks, link);

		if (!keepStatus) {
			delete localStorage[link.id+'_state'];
		}

		link.updateStatus(statuses.READY);
	};

	link.may_save_state = function () {
		if (browser.queue.running ||
			link.has_saved_state ||
			link.status ||
			!link.save_state) {
			return;
		}

		if ((link.queue || link.r_queue).running) {
			console.warn(link.id+': '+'Queue is running but status is zero!');
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
			broadcastMessage('may_save_state');
		}
	};
	obj.queue_error = function () {
		// disable link on error
		this.queue_stop();
		this.stop();
	}
}

// implement a queue of XMLHttpRequests for a given object
function import_rqueue(obj) {

	// variables
	obj.r_queue= []; // remote queue (list of [payload, callback])

	// functons

	obj.r_queue_add = function (url, payload, callback) {
		var req = new XMLHttpRequest();
		req.open("POST", url, true);
		req.url = url; // only for me, not for the request
		var params = '';
		var key;
		for (key in payload) {
			params += (params?'&':'')+key+'='+encodeURIComponent(payload[key]);
		}
		this.r_queue_add_req(req, params, callback);
	};

	obj.r_queue_add_req = function (req, params, callback) {
		this.r_queue.push([req, params, callback]);
		if (!this.r_queue.running) {
			this.r_queue.running = true;
			this.updateStatus(statuses.UPLOADING);
			this.r_queue_next();
		}
	};

	obj.r_queue_next = function () {

		if (this.r_queue.length == 0) {
			console.log('Finished uploading');
			this.r_queue.running = false;
			this.updateStatus(statuses.READY); // update popup with 'finished' count

			// save my own state when it is finished
			this.may_save_state();

			// save current state when everything has been uploaded
			if (this.initial_commit) {
				this.save_state();
			}
			return;
		}

		// update the popup with the new 'left' count
		this.updateStatus(statuses.UPLOADING);

		var req      = this.r_queue[0][0];
		var params   = this.r_queue[0][1];
		var callback = this.r_queue[0][2];
		this.r_queue.shift();
		var obj = this;
		req.onreadystatechange = function () {
			if (req.readyState != 4) return; // not loaded
			// request completed

			if (req.status != 200) {
				console.error('Request failed, status='+req.status+', url='+req.url+', params='+params);
			}
			if (callback) callback(req);
			obj.r_queue_next(); // do the next push
		}
		req.send(params);
	};
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

