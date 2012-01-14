'use strict';

/* Library for sync targets
 *
 * Link API:
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
 * onUpdateStatus:
 *     called when the status is updated.
 * startSync:
 *     start the sync.
 * stopSync:
 *     stop the sync and clear memory.
 * bm_add:
 *     Add a bookmark
 * bm_del:
 *     Delete a bookmark
 * f_add:
 *     Add a single folder without content
 * f_del:
 *     Delete a folder tree
 */

function Link (id) {
	// initialize object
	this.id = id;

	// various default variables
	this.started = false;
	this.status = statuses.READY; // only to initialize
	this.loaded = true;

	this.enabled = false;
	if (!(this instanceof Browser)) {
		// self-test
		if (!this.id) throw 'no id: '+this.name;

		// load enabled/disabled state
		if (localStorage[this.id+'_synced']) {
			this.enabled = JSON.parse(localStorage[this.id+'_synced']);
		}
	}
}

Link.prototype.load = function () {
	// start if enabled
	if (this.enabled) {
		// disable it first and then re-enable it in this.start
		this.enabled = false;
		this.start();
	}
};

// Start the link
// @var force Force this link to start, also when it is already started
Link.prototype.start = function (restart) {
	// link should first be loaded
	if (!this.loaded && this != browser) { // browser doesn't need loading
		console.error('link '+this.id+' started when it was not initialized');
		return;
	}

	if (this != browser) {
		if (this.enabled) {
			if (!restart) return;
		} else {
			// mark enabled
			this.enabled = true;
			localStorage[this.id+'_synced'] = JSON.stringify(true);

			sync2all.syncedWebLinks.push(this);

			// whether this link needs extra url/tag indices
			if (this instanceof TagBasedLink) {
				tagtree.addLink(this);
			}
		}
	}

	if (this.status) {
		console.error('BUG: '+this.id+'.startSync called while link is busy (status is non-zero)');
		return;
	}

	// now start the link. Should be done when it is enabled
	this._startSync();
};


Link.prototype._startSync = function () {
	// first, initialize the link

	this.bookmarks = {bm: {}, f: {}};

	// only for webLinks:
	if (this != browser) {
		this.actions = [];
	}

	// now start the link
	this.startSync();
}

Link.prototype.msg_restart = function () {
	this.start(true);
}

	// TODO better name
Link.prototype.startingFinished = function () {
	if (localStorage[this.id+'_state']) {
		// load saved status
		var state = JSON.parse(localStorage[this.id+'_state']);

		// for tree-based bookmark systems
		if (this instanceof TreeBasedLink) {
			// map link-specific IDs to local browser IDs.
			// WARNING: when the link_id is not known, this will give strange
			// behaviour (when a moved bookmark or folder moves to the
			// bookmarks root)
			this.ownId_to_lId = {undefined: sync2all.bookmarks.id};
			this.mapLinkIdsToLocalIds(state);
		}

		// now calculate the actions once all data has been loaded.
		this.calculate_actions(state, this.bookmarks);

		// display message when there are actions
		if (this.actions.length) {
			console.log(this.id+'.actions:');
			console.log(this.actions);
		}
	}

	if (sync2all.messageListeners.indexOf(this) < 0) {
		sync2all.messageListeners.push(this);
	}

	// start merging
	sync2all.onLinkFinished(this);
}

// Stop link. remove memory-eating status if the keepStatus flag is not set.
Link.prototype.stop = Link.prototype.msg_stop = function (keepStatus) {
	localStorage[this.id+'_synced'] = JSON.stringify(false);
	this.enabled = false;
	if (this != browser) {
		Array_remove(sync2all.syncedWebLinks, this);
	}
	// check whether this link has finished after starting. It is possible
	// that there's an error while it starts, and that it disables itself.
	if (sync2all.messageListeners.indexOf(this) >= 0) {
		Array_remove(sync2all.messageListeners, this);
	}

	// whether this link needs extra url/tag indices
	if (this instanceof TagBasedLink) {
		tagtree.removeLink(this);
	}

	if (!keepStatus) {
		delete localStorage[this.id+'_state'];
	}

	this.updateStatus(statuses.READY);
};

Link.prototype.commit = function () {
	if (debug) {
		console.warn(this.id+' commit -- backtrace:');
		console.trace();
	}
	this.queue_start(); // start running
}

Link.prototype.may_save_state = function () {
	if (browser.queue.running ||
		this.has_saved_state ||
		this.status ||
		this == browser) {
		return;
	}

	if ((this.queue || this.r_queue).running) {
		console.warn(this.id+': Queue is running but status is zero!');
		console.log(this);
		return; // will be started when the queue is empty
	}

	this.has_saved_state = true;

	console.log(this.id+': saving state:');
	console.trace();
	this.save_state();
};

Link.prototype.save_state = function () {
	if (this instanceof TreeBasedLink) {
		var state = [];
	} else {
		var state = {bm: [], f: {}};
	}
	this.get_state(state, sync2all.bookmarks);
	localStorage[this.id+'_state'] = JSON.stringify(state);
}

Link.prototype.updateStatus = function (status) {
	// ??? to use my object (this), I have to use 'link' instead of 'this'.
	if (status !== undefined) {
		this.status = status;
	}
	if (this == browser) return; // not in popup

	if (this.onUpdateStatus) {
		this.onUpdateStatus(status !== undefined);
	}

	if (!sync2all.browser.isPopupOpen) return;

	// make make human-readable message
	var msgtext = 'Not synchronized';
	if (this.enabled) {
		if (this.status == statuses.READY) {
			msgtext = 'Synchronized';
		} else if (this.status == statuses.AUTHORIZING) {
			msgtext = 'Authorizing...';
		} else if (this.status == statuses.DOWNLOADING) {
			msgtext = 'Downloading...';
		} else if (this.status == statuses.PARSING) {
			msgtext = 'Parsing bookmarks data...';
		} else if (this.status == statuses.MERGING) {
			msgtext = 'Syncing...';
		} else if (this.status == statuses.UPLOADING) {
			msgtext = 'Uploading ('+((this.queue||this.r_queue).length+1)+' left)...';
		} else {
			msgtext = 'Enabled, but unknown status (BUG! status='+this.status+')';
		}
	}
	var btn_start = !this.enabled || !this.status && this.enabled;
	var btn_stop  = this.enabled && !this.status;

	var message = {action: 'updateUi', id: this.id, message: msgtext, btn_start: btn_start, btn_stop: btn_stop};

	// send message to specific browsers
	if (browser.name == 'chrome') {
		chrome.extension.sendRequest(message, function () {});
	} else if (browser.name == 'firefox') {
		browser.popupDOM.getElementById('sync2all-'+this.id+'-status').value = msgtext;
		browser.popupDOM.getElementById('sync2all-'+this.id+'-button-start').disabled = !btn_start;
		browser.popupDOM.getElementById('sync2all-'+this.id+'-button-stop').disabled  = !btn_stop;
	} else if (browser.name == 'opera') {
		opera.extension.broadcastMessage(message);
	}
}

Link.prototype.mark_state_deleted = function (state) {

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

/* Errors */

Link.prototype.errorStarting = function (msg) {
	console.log(msg);
	console.log(this.name+' will now be disabled');
	this.stop();
}

/* Self-check */

Link.prototype.testfail = function (error, element) {
	console.log(element);
	throw (this.fullName || this.name)+' Failed test: '+error;
}

Link.prototype.selftest = function () {
	if (this == browser) {
		this.subselftest(sync2all.bookmarks);
	} else {
		this.subselftest(this.bookmarks);
	}
	console.log(this.fullName+' has passed the intergity test');
}

Link.prototype.subselftest = function (folder) {
	// test this folder
	if (folder.f instanceof Array)
		this.testfail('folder.f instanceof Array');
	if (folder.bm instanceof Array)
		this.testfail('folder.bm instanceof Array');

	// test bookmarks in this folder
	var url;
	for (url in folder.bm) {
		var bm = folder.bm[url];
		if (!bm.url == url)
			this.testfail('bm.url != folder.bm[url]', [folder, bm]);
		if (bm.parentNode != folder) {
			this.testfail('bm.parentNode != folder', [folder, bm]);
		}
		this.testNode(bm);
	}

	// test subfolders
	var title;
	for (title in folder.f) {
		var subfolder = folder.f[title];
		if (!subfolder.title == title)
			this.testfail('subfolder.title != title', subfolder);
		if (!subfolder.bm)
			this.testfail('!subfolder.bm');
		if (!subfolder.f)
			this.testfail('!subfolder.f');
		this.testNode(subfolder);
		this.subselftest(subfolder);
	}
}

// general tests
Link.prototype.testNode = function (node) {
	if (this instanceof Browser) {
		if (!node.id)
			this.testfail('!node.id', node);
		var webLink;
		for (var i=0; webLink=sync2all.syncedWebLinks[i]; i++) {
			if (!webLink.queue.running && !webLink.queue.length && !webLink.status) {
				if (webLink instanceof TreeBasedLink) {
					if (!node[webLink.id+'_id'])
						this.testfail('!node.*_id', [node, webLink.id]);
				} else {
					if (node[webLink.id+'_id'])
						this.testfail('node.*_id', [node, webLink.id]);
				}
			}
		}
	} else {
		if (this instanceof TreeBasedLink) {
			if (!node[this.id+'_id'])
				this.testfail('!node.*_id', node);
		} else {
			if (node[this.id+'_id'])
				this.testfail('node.*_id', node);
		}
	}
}

Link.prototype.copyBookmark = function (bm) {
	var newbm = {url: bm.url, title: bm.title, parentNode: bm.parentNode, mtime: bm.mtime};
	if (this == browser) {
		newbm.id = bm.id;
	} else {
		if (!(this instanceof TagBasedLink)) {
			newbm[this.id+'_id'] = bm[this.id+'_id'];
		}
	}
	return newbm;
}

/* variables */
Link.prototype.queue = [];

// add a function to the queue
Link.prototype.queue_add = function (callback, data) {
	this.queue.push([callback, data]);
};

// start walking through the queue if it isn't already started
Link.prototype.queue_start = function () {
	if (this.queue.running) {
		// just ignore
		return;
	}
	this.updateStatus(statuses.UPLOADING);
	this.queue.running = true;
	this.queue_next();
};

// execute the next function in the queue
Link.prototype.queue_next = function () {
	var queue_item = this.queue.shift();
	if (!queue_item) {

		// queue has finished!
		this.queue_stop();
	} else {
		// send amount of lasting uploads to the popup
		this.updateStatus();

		var callback = queue_item[0];
		var data     = queue_item[1];
		callback(data);
	}
};

Link.prototype.queue_stop = function () {
	// queue has been finished (or has been interrupted?)
	this.queue.running = false;
	this.queue.length = 0; // for when the queue has been forced to stop, clear the queue

	this.updateStatus(statuses.READY);
	console.log(this.name+' has finished the queue!!!');

	if (debug) {
		var finished_uploading = true;
		var webLink;
		for (var i=0; webLink=webLinks[i]; i++) {
			if (webLink.enabled && webLink.queue.running) {
				finished_uploading = false;
			}
		}
		if (!browser.queue.running && finished_uploading) {
			browser.selftest();
		}
	}

	// save current state when everything has been uploaded
	// this occurs also when there is nothing in the queue when the
	// first commit happens.
	this.may_save_state();
};

Link.prototype.queue_error = function () {
	// disable link on error
	this.queue_stop();
	this.stop();
};


