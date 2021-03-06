var expect = require('expect.js');
var sinon = require('auto-release-sinon');
var ngMock = require('ngMock');
var jQuery = require('jquery');
var Promise = require('bluebird');
var noDigestPromises = require('testUtils/noDigestPromises');
var kibiState;
var $scope;

var mockSavedObjects = require('fixtures/kibi/mock_saved_objects');
var fakeSavedDatasources = [
  {
    id: 'ds1',
    title: 'ds1 datasource',
    datasourceType: 'sparql_http'
  },
  {
    id: 'ds2',
    title: 'ds2 datasource',
    datasourceType: 'mysql'
  },
  {
    id: 'ds3',
    title: 'ds3 datasource',
    datasourceType: 'rest'
  }
];

describe('Kibi Controllers', function () {

  function init({ hits, snippet, snippetError, query, datasourceType }) {
    ngMock.module('kibana', function ($provide) {
      $provide.constant('kbnDefaultAppId', '');
      $provide.constant('kibiDefaultDashboardId', '');
      $provide.constant('elasticsearchPlugins', ['siren-join']);
    });

    ngMock.module('kibi_datasources/services/saved_datasources', function ($provide) {
      $provide.service('savedDatasources', (Promise) => mockSavedObjects(Promise)('savedDatasources', fakeSavedDatasources));
    });

    ngMock.module('app/visualize', function ($provide) {
      $provide.service('savedVisualizations', (Promise) => mockSavedObjects(Promise)('savedVisualizations', hits));
    });

    ngMock.module('kibana/query_engine_client', function ($provide) {
      $provide.service('queryEngineClient', function () {
        return {
          clearCache: function () {
            return Promise.resolve();
          },
          getQueriesHtmlFromServer: function () {
            var resp = {
              data: {
                snippets: snippet ? [ snippet ] : [],
                error: snippetError
              }
            };
            return Promise.resolve(resp);
          }
        };
      });
    });

    ngMock.inject(function (Private, $rootScope, $controller, _kibiState_) {
      var urlHelper = Private(require('ui/kibi/helpers/url_helper'));
      sinon.stub(urlHelper, 'onSettingsTab').returns(true);

      kibiState = _kibiState_;
      sinon.stub(kibiState, 'getEntityURI').returns('entity1');

      $scope = $rootScope;
      $scope.datasourceType = datasourceType;
      $controller('QueriesEditor', {
        $scope: $scope,
        $route: {
          current: {
            locals: {
              query: query
            }
          }
        },
        $element: jQuery('<div><form name="objectForm" class="ng-valid"></div>')
      });
      $scope.$digest();
    });
  }

  describe('queries editor', function () {

    noDigestPromises.activateForSuite();

    it('should enable the entity URI', function () {
      var query = {
        id: 'ahah',
        title: 'ahah',
        activationQuery: '@doc[id]@'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(true);
    });

    it('should detect the star', function () {
      var query = {
        title: 'ahah',
        activationQuery: 'select * { ?s :name ?o }'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
      expect($scope.starDetectedInAQuery).to.be(true);
    });

    it('should not detect the subselect star for SPARQL', function () {
      var query = {
        title: 'ahah',
        activationQuery: 'SELECT ?id { { SELECT * { ?s :name ?o } }}'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
      expect($scope.starDetectedInAQuery).to.be(false);
    });

    it('should detect the star for SQL query', function () {
      var query = {
        title: 'ahah',
        activationQuery: 'select * from company limit 10'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
      expect($scope.starDetectedInAQuery).to.be(true);
    });

    it('should not detect the subselect star for SQL', function () {
      var query = {
        title: 'ahah',
        activationQuery: 'select id from ( select * from company limit 100 ) limit 10'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
      expect($scope.starDetectedInAQuery).to.be(false);
    });

    it('should detect comment lines for activationQuery', function () {
      var query = {
        title: 'commented lines',
        activationQuery: 'select * \n' +
                         'from test \n' +
                         '/* where name \n' + '= \'@doc[_source][github_id]@\' */'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
    });

    it('should detect comment lines for resultQuery', function () {
      var query = {
        title: 'commented lines',
        resultQuery: 'select * \n' +
                     'from test \n' +
                     '/* where name \n' + '= \'@doc[_source][github_id]@\' */'
      };
      init({ query: query });
      expect($scope.holder.entityURIEnabled).to.be(false);
    });

    it('should submit the query', function (done) {
      var query = {
        title: '123',
        save: sinon.stub().returns(Promise.resolve('queryid'))
      };
      var snippet = {
        john: 'connor',
        html: 'are you there'
      };

      init({ query: query, snippet: snippet });

      expect($scope.holder.htmlPreview).not.to.be.ok();
      expect($scope.holder.jsonPreview).not.to.be.ok();
      $scope.submit().then(function () {
        expect($scope.holder.htmlPreview).to.be('are you there');
        expect($scope.holder.jsonPreview).to.be.ok();
        done();
      }).catch(done);
    });

    it('should display an error on submit if the query is not correct', function (done) {
      var query = {
        title: '123',
        save: sinon.stub().returns(Promise.resolve('queryid'))
      };

      init({ query: query, snippetError:'error with the query' });

      expect($scope.holder.htmlPreview).not.to.be.ok();
      expect($scope.holder.jsonPreview).not.to.be.ok();
      $scope.submit().then(function () {
        expect($scope.holder.jsonPreview).to.be.ok();
        expect($scope.holder.htmlPreview).to.match(/Error/);
        done();
      }).catch(done);
    });

    it('should update the REST datasource', function () {
      noDigestPromises.deactivate();
      var query = {};
      init({ query: query, datasourceType: '123' });

      var stub = sinon.spy($scope, 'preview');
      expect($scope.datasourceType).to.be('123');
      query.datasourceId = 'ds3';
      $scope.$digest();
      expect($scope.datasourceType).to.be('rest');
      expect($scope.preview.templateId).to.be('kibi-json-jade');
      expect(stub.called).to.be(true);
    });

    it('should update the datasource type along with the datasource ID', function () {
      noDigestPromises.deactivate();
      var query = {};
      init({ query: query, datasourceType: '123' });

      var stub = sinon.spy($scope, 'preview');
      expect($scope.datasourceType).to.be('123');
      query.datasourceId = 'ds1';
      $scope.$digest();
      expect($scope.datasourceType).to.be('sparql_http');
      expect($scope.preview.templateId).to.be('kibi-table-jade');
      expect(stub.called).to.be(true);
    });
  });
});
