
/* Library for sync targets
 */

function use_target (target, isBrowser) {

	// initialisation of global variables
	if (isBrowser) {
		// this link is a browser link
		browser.link = target;
	} else {
		webLinks.push(target);
	}

	// should be called only once
	target.init = function () {
		if (target._init) {
			target._init(); // should also be called only once
		}

		if (target != browser.link) {
			// start if enabled
			if (localStorage[target.shortname+'_enabled']) {
				target.enable();
			}
		}
	};

	target.updateStatus = function (status) {
		// ??? to use my object (this), I have to use 'target' instead of 'this'.
		if (status !== undefined) {
			target.status = status;
		}
		if (target == browser.link) return; // not in popup
		if (!is_popup_open) return;

		// make make human-readable message
		var msgtext = 'Not synchronized';
		if (target.enabled) {
			if (target.status == statuses.READY) {
				msgtext = 'Synchronized';
			} else if (target.status == statuses.AUTHORIZING) {
				msgtext = 'Authorizing...';
			} else if (target.status == statuses.DOWNLOADING) {
				msgtext = 'Downloading...';
			} else if (target.status == statuses.PARSING) {
				msgtext = 'Parsing bookmarks data...';
			} else if (target.status == statuses.MERGING) {
				msgtext = 'Syncing...';
			} else if (target.status == statuses.UPLOADING) {
				msgtext = 'Uploading ('+((target.queue||target.r_queue).length+1)+' left)...';
			} else {
				msgtext = 'Enabled, but unknown status (BUG! status='+target.status+')';
			}
		}
		var btn_start = !target.enabled || !target.status && target.enabled;
		var btn_stop  = target.enabled && !target.status;

		var message = {action: 'updateUi', shortname: target.shortname, message: msgtext, btn_start: btn_start, btn_stop: btn_stop};

		// send message to specific browsers
		if (browser.name == 'chrome') {
			chrome.extension.sendRequest(message, function () {});
		} else if (browser.name == 'firefox') {
			if (is_popup_open) {
				current_document.getElementById('sync2all-'+target.shortname+'-status').value = msgtext;
				current_document.getElementById('sync2all-'+target.shortname+'-button-start').disabled = !btn_start;
				current_document.getElementById('sync2all-'+target.shortname+'-button-stop').disabled  = !btn_stop;
			}
		} else if (browser.name == 'opera') {
			opera.extension.broadcastMessage(message);
		}
	}

	target.mark_state_deleted = function (state) {

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
	target.onRequest = function (request, sender, sendResponse) {
		// handle request
		if (request.action.substr(0, target.shortname.length+1) == target.shortname+'_') {
			target['msg_'+request.action.substr(request.action.indexOf('_')+1)](request, sender);
		}
	}
	if (browser.name == 'chrome') {
		chrome.extension.onRequest.addListener(target.onRequest);
	} else if (browser.name == 'firefox') {
	}

	target.may_save_state = function () {
		if (browser.link.queue.running ||
			target.has_saved_state ||
			target.status ||
			!target.save_state) {
			return;
		}

		if ((target.queue || target.r_queue).running) {
			console.warn(target.shortname+': '+'Queue is running but status is zero!');
			console.log(target);
			return; // will be started when the queue is empty
		}

		target.has_saved_state = true;

		console.log(target.shortname+': saving state:');
		console.trace();
		target.save_state();
	};

	// like target.start, but only called when it is not already enabled
	target.enable = target.msg_enable = function () {
		// don't re-enable
		if (target.enabled) return;

		if (target.status) {
			console.error('Target is not enabled but status is non-zero! (BUG!):');
			console.log(target);
			delete localStorage.opl_enabled; // just to be sure
			alert('There is a bug in Opera Link. Opera Link is now disabled. See the log for details.');
			return;
		}

		// mark enabled
		// This also prevents that this link is started twice unneeded
		target.enabled = true;
		// don't do these things for the browser link, they are only meant for
		// the links to extern sources
		if (target != browser.link) {
			localStorage[target.shortname+'_enabled'] = true;
			enabledWebLinks.push(target);
		}

		// clear variables
		target.has_saved_state = false;

		// now start the target. Should be done when it is enabled
		target.start();
	};

	// Stop Opera Link, but leave status information
	target.stop = function () {
		delete localStorage[target.shortname+'_enabled'];
		target.enabled = false;
		if (target != browser.link) {
			Array_remove(enabledWebLinks, target);
		}
		Array_remove(remotes_finished, target);

		target.updateStatus(statuses.READY);
	};

	// remove memory-eating status information and stop
	// This will be called from the popup.
	target.msg_disable = target.disable = function () {
		delete localStorage[target.shortname+'_state'];
		target.stop();
	};

	target.status = statuses.READY; // only to initialize


};


function use_queue (obj) {

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
		if (this == browser.link) {
			// save all states when they are ready
			call_all('may_save_state');
		}
	};
	obj.queue_error = function () {
		// disable link on error
		this.queue_stop();
		this.stop();
	}
}

// implement a queue of XMLHttpRequests for a given object
function use_rqueue(obj) {

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
		call_all('bm_mv', link, [node, oldParent]);
	} else {
		// folder
		if (newParent.f[node.title]) {
			console.log('FIXME: duplicate folder overwritten (WILL FAIL AT SOME POINT!!!)');
		}
		newParent.f[node.title] = node;
		delete oldParent.f[node.title];
		call_all('f_mv', link, [node, oldParent]);
	}
	commit();
}

