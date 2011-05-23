
/* Library for sync targets
 */
function use_target (target) {
	target.updateStatus = function (status) {
		if (status !== undefined) {
			this.status = status;
		}
		chrome.extension.sendRequest({action: 'updateUi', target: this.shortname}, function () {});
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

}
