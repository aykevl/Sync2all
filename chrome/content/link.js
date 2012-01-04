'use strict';

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

function Link (isBrowser) {
	// initialisation of global variables
	if (!isBrowser) {
		webLinks.push(this);
	}

	// various default variables
	this.started = false;
	this.status = statuses.READY; // only to initialize
	this.loaded = true;

	// load enabled/disabled state
	if (localStorage[this.id+'_enabled']) {
		this.enabled = JSON.parse(localStorage[this.id+'_enabled']);
	} else {
		this.enabled = false;
	}
}
function import_link (link, isBrowser) {
	link.Link = Link;
	link.Link(isBrowser);

	link.load = function () {
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

		if (link != browser) {
			if (link.enabled) {
				if (!restart) return;
			} else {
				// mark enabled
				link.enabled = true;
				localStorage[link.id+'_enabled'] = JSON.stringify(true);

				enabledWebLinks.push(link);

				// whether this link needs extra url/tag indices
				if (link.flag_tagStructure && !link.flag_treeStructure) {
					tagtree.addLink(link);
				}
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

	// TODO better name
	link.startingFinished = function () {
		if (localStorage[link.id+'_state']) {
			// load saved status
			var state = JSON.parse(localStorage[link.id+'_state']);

			// for tree-based bookmark systems
			if (link.flag_treeStructure) {
				// map link-specific IDs to local browser IDs.
				// WARNING: when the link_id is not known, this will give strange
				// behaviour (when a moved bookmark or folder moves to the
				// bookmarks root)
				link.ownId_to_lId = {undefined: sync2all.bookmarks.id};
				link.mapLinkIdsToLocalIds(state);
			}

			// now calculate the actions once all data has been loaded.
			link.calculate_actions(state, link.bookmarks);

			// display message when there are actions
			if (link.actions.length) {
				console.log(link.id+'.actions:');
				console.log(link.actions);
			}
		}

		if (sync2all.messageListeners.indexOf(link) < 0) {
			sync2all.messageListeners.push(link);
		}

		// start merging
		sync2all.onLinkFinished(link);
	}

	// called when sync has been finished.
	link.syncFinished = function () {
		if (link != browser) {
			// clean up unused memory
			if (!debug) {
				delete link.bookmarks;
				delete link.ids;
			}
		}
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
		if (sync2all.messageListeners.indexOf(link) >= 0) {
			Array_remove(sync2all.messageListeners, link);
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
		if (debug) {
			console.warn(link.id+' commit -- backtrace:');
			console.trace();
		}
		link.queue_start(); // start running
	}

	link.may_save_state = function () {
		if (browser.queue.running ||
			link.has_saved_state ||
			link.status ||
			link == browser) {
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

	link.save_state = function () {
		if (link.flag_treeStructure) {
			var state = [];
		} else {
			var state = {bm: [], f: {}};
		}
		link.get_state(state, sync2all.bookmarks);
		localStorage[link.id+'_state'] = JSON.stringify(state);
	}

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

	link.onRequest = function (request, sender, sendResponse) {
		// handle request
		if (request.action.substr(0, link.id.length+1) == link.id+'_') {

			// convert linkid_action to msg_action
			link['msg_'+request.action.substr(request.action.indexOf('_')+1)](request, sender);
		}
	}
	if (browser.name == 'chrome' && link != browser) {
		chrome.extension.onRequest.addListener(link.onRequest);
	} else if (browser.name == 'firefox') {
	}

	/* Errors */

	link.errorStarting = function (msg) {
		console.log(msg);
		console.log(link.name+' will now be disabled');
		link.stop();
	}

	/* Self-check */

	link.testfail = function (error, element) {
		console.log(element);
		throw (link.fullName || link.name)+' Failed test: '+error;
	}

	link.selftest = function () {
		if (link == browser) {
			link.subselftest(sync2all.bookmarks);
		} else {
			link.subselftest(link.bookmarks);
		}
		console.log(link.fullName+' has passed the intergity test');
	}

	link.subselftest = function (folder) {
		var url;
		for (url in folder.bm) {
			var bm = folder.bm[url];
			if (!bm.url == url)
				link.testfail('bm.url != folder.bm[url]', [folder, bm]);
			if (bm.parentNode != folder) {
				link.testfail('bm.parentNode != folder', [folder, bm]);
			}
			link.testId(bm);
		}
		var title;
		for (title in folder.f) {
			var subfolder = folder.f[title];
			if (!subfolder.title == title)
				link.testfail('subfolder.title != title', subfolder);
			if (!subfolder.bm)
				link.testfail('!subfolder.bm');
			if (!subfolder.f)
				link.testfail('!subfolder.f');
			link.testId(subfolder);
			link.subselftest(subfolder);
		}
	}

	link.testId = function (node) {
		if (link == browser) {
			if (!node.id)
				link.testfail('!node.id', node);
			var webLink;
			for (var i=0; webLink=enabledWebLinks[i]; i++) {
				if (webLink.enabled && !webLink.queue.running && !webLink.queue.length && !webLink.status) {
					if (!webLink.flag_tagStructure) {
						if (!node[webLink.id+'_id'])
							link.testfail('!node.*_id', [node, webLink.id]);
					} else {
						if (node[webLink.id+'_id'])
							link.testfail('node.*_id', [node, webLink.id]);
					}
				}
			}
		} else {
			if (!link.flag_tagStructure) {
				if (!node[link.id+'_id'])
					link.testfail('!node.*_id', node);
			}
		}
	}

	link.copyBookmark = function (bm) {
		var newbm = {url: bm.url, title: bm.title, parentNode: bm.parentNode, mtime: bm.mtime};
		if (link == browser) {
			newbm.id = bm.id;
		} else {
			if (!link.flag_tagStructure) {
				newbm[link.id+'_id'] = bm[link.id+'_id'];
			}
		}
		return newbm;
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
	};

	obj.queue_stop = function () {
		// queue has been finished!!!
		this.queue.running = false;
		this.queue.length = 0; // for when the queue has been forced to stop, clear the queue

		this.updateStatus(statuses.READY);
		console.log(this.name+' has finished the queue!!! '+this.queue.id+this.queue.running);

		if (debug) {
			var finished_uploading = true;
			var webLink;
			for (var i=0; webLink=webLinks[i]; i++) {
				if (webLink.enabled && webLink.queue.running) {
					finished_uploading = false;
				}
			}
			if (!browser.queue.running && finished_uploading) {
				var link = browser; // just to be sure it works
				browser.selftest();
			}
		}

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


