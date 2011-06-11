
/* Library for sync targets
 */

function use_target (target) {
	target.updateStatus = function (status) {
		// ??? to use my object (this), I have to use 'target' instead of 'this'.
		if (status !== undefined) {
			target.status = status;
		}
		if (!is_popup_open) return;
		chrome.extension.sendRequest({action: 'updateUi', shortname: target.shortname, left: (target.queue||target.r_queue).length, status: target.status, enabled: target.enabled}, function () {});
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
	chrome.extension.onRequest.addListener(target.onRequest);
};


