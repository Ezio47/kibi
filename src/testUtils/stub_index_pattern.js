define(function (require) {
  return function (Private) {
    let _ = require('lodash');
    let sinon = require('sinon');
    let Promise = require('bluebird');
    let IndexedArray = require('ui/IndexedArray');
    let IndexPattern = require('ui/index_patterns/_index_pattern');
    let fieldFormats = Private(require('ui/registry/field_formats'));
    let flattenHit = Private(require('ui/index_patterns/_flatten_hit'));
    let formatHit = require('ui/index_patterns/_format_hit');
    let getComputedFields = require('ui/index_patterns/_get_computed_fields');

    let Field = Private(require('ui/index_patterns/_field'));

    function StubIndexPattern(pattern, timeField, fields) {
      this.id = pattern;
      this.popularizeField = sinon.spy();
      this.timeFieldName = timeField;
      this.getNonScriptedFields = sinon.spy();
      this.getScriptedFields = sinon.spy();
      this.getSourceFiltering = sinon.spy();
      this.metaFields = ['_id', '_type', '_source'];
      this.fieldFormatMap = {};
      this.routes = IndexPattern.prototype.routes;

      this.toIndexList = _.constant(Promise.resolve([pattern]));
      this.toDetailedIndexList = _.constant(Promise.resolve([
        {
          index: pattern,
          min: 0,
          max: 1
        }
      ]));
      this.getComputedFields = _.bind(getComputedFields, this);
      this.flattenHit = flattenHit(this);
      this.formatHit = formatHit(this, fieldFormats.getDefaultInstance('string'));
      this.formatField = this.formatHit.formatField;

      this._indexFields = function () {
        this.fields = new IndexedArray({
          index: ['name'],
          group: ['type'],
          initialSet: fields.map(function (field) {
            return new Field(this, field);
          }, this)
        });
      };

      this._indexFields();
    }

    return StubIndexPattern;
  };
});
