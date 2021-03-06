define(function (require) {
  return function PendingRequestListWrapped(Private) {

    var requestQueue = Private(require('ui/courier/_request_queue'));

    requestQueue.markAllRequestsWithSourceIdAsInactive = function (_id) {
      // iterate backwords so when we remove 1 item we do not care about the length being changed
      var n = this.length - 1;

      for (var i = n; i >= 0; i--) {
        var r = this[i];
        if (r && r.source && r.source._id === _id) {
          // mark source as inactive
          r.source._disabled = true;
          // remove the request from queue
          this.splice(i, 1);
        }
      }
    };

    return requestQueue;
  };
});
