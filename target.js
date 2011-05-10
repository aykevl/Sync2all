
/* Library for sync targets
 */
function use_target (target) {
	target.updateStatus = function (status) {
		if (status !== undefined) {
			this.status = status;
		}
		chrome.extension.sendRequest({action: 'updateUi', target: this.shortname}, function () {});
	}
}
