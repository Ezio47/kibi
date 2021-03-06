
let _ = require('lodash');
let expect = require('expect.js');
let ngMock = require('ngMock');

describe('AggConfig Filters', function () {
  describe('filters', function () {
    let AggConfig;
    let indexPattern;
    let Vis;
    let createFilter;

    beforeEach(ngMock.module('kibana', function ($provide) {
      $provide.constant('kbnDefaultAppId', '');
      $provide.constant('kibiDefaultDashboardId', '');
      $provide.constant('elasticsearchPlugins', ['siren-join']);
    }));
    beforeEach(ngMock.inject(function (Private) {
      Vis = Private(require('ui/Vis'));
      AggConfig = Private(require('ui/Vis/AggConfig'));
      indexPattern = Private(require('fixtures/stubbed_logstash_index_pattern'));
      createFilter = Private(require('ui/agg_types/buckets/create_filter/filters'));
    }));

    it('should return a filters filter', function () {
      let vis = new Vis(indexPattern, {
        type: 'histogram',
        aggs: [
          {
            type: 'filters',
            schema: 'segment',
            params: {
              filters: [
                { input: { query: { query_string: { query: '_type:apache' } } } },
                { input: { query: { query_string: { query: '_type:nginx' } } } }
              ]
            }
          }
        ]
      });

      let aggConfig = vis.aggs.byTypeName.filters[0];
      let filter = createFilter(aggConfig, '_type:nginx');
      expect(_.omit(filter, 'meta')).to.eql(aggConfig.params.filters[1].input);
      expect(filter.meta).to.have.property('index', indexPattern.id);

    });

  });
});
