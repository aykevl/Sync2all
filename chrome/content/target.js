
/* Library for sync targets
 */

function use_target (target) {
	target.updateStatus = function (status) {
		// ??? to use my object (this), I have to use 'target' instead of 'this'.
		if (status !== undefined) {
			target.status = status;
		}
		if (!is_popup_open) return;

		// make make human-readable message
		var message = 'Not synchronized';
		if (target.enabled) {
			if (target.status == statuses.READY) {
				message = 'Synchronized';
			} else if (target.status == statuses.AUTHORIZING) {
				message = 'Authorizing...';
			} else if (target.status == statuses.DOWNLOADING) {
				message = 'Downloading...';
			} else if (target.status == statuses.PARSING) {
				message = 'Parsing bookmarks data...';
			} else if (target.status == statuses.MERGING) {
				message = 'Syncing...';
			} else if (target.status == statuses.UPLOADING) {
				message = 'Uploading ('+((target.queue||target.r_queue).length+1)+' left)...';
			} else {
				message = 'Enabled, but unknown status (BUG! status='+target.status+')';
			}
		}
		var btn_start = !target.enabled || !target.status && target.enabled;
		var btn_stop  = target.enabled && !target.status;

		// send message to specific browsers
		if (browser.name == 'chrome') {
			chrome.extension.sendRequest({action: 'updateUi', shortname: target.shortname, message: message, btn_start: btn_start, btn_stop: btn_stop}, function () {});
		} else if (browser.name == 'firefox') {
			if (is_popup_open) {
				current_document.getElementById('sync2all-'+target.shortname+'-status').value = message;
				current_document.getElementById('sync2all-'+target.shortname+'-button-start').disabled = !btn_start;
				current_document.getElementById('sync2all-'+target.shortname+'-button-stop').disabled  = !btn_stop;
			}
		}
	}

	target.mark_state_deleted = function (state) {

		// remove the subfolders first
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
		if (current_browser.queue.running ||
			target.has_saved_state ||
			(target.queue || target.r_queue).running ||
			!target.save_state) {
			return;
		}

		target.has_saved_state = true;

		console.log(target.shortname+': saving state');
		target.save_state();
	};
};


