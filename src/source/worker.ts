import {Actor} from '../util/actor';
import {StyleLayerIndex} from '../style/style_layer_index';
import {VectorTileWorkerSource} from './vector_tile_worker_source';
import {GeoJSONWorkerSource} from './geojson_worker_source';
import {isWorker} from '../util/util';

import type {
    WorkerSource,
    WorkerTileParameters,
    WorkerTileCallback,
    TileParameters
} from '../source/worker_source';

import type {WorkerGlobalScopeInterface} from '../util/web_worker';
import type {Callback} from '../types/callback';
import type {LayerSpecification} from '@maplibre/maplibre-gl-style-spec';

/**
 * The Worker class responsidble for background thread related execution
 */
export default class Worker {
    self: WorkerGlobalScopeInterface;
    actor: Actor;
    layerIndexes: {[_: string]: StyleLayerIndex};
    availableImages: {[_: string]: Array<string>};
    workerSourceTypes: {
        [_: string]: {
            new (...args: any): WorkerSource;
        };
    };
    workerSources: {
        [_: string]: {
            [_: string]: {
                [_: string]: WorkerSource;
            };
        };
    };

    referrer: string;

    constructor(self: WorkerGlobalScopeInterface) {
        this.self = self;
        this.actor = new Actor(self, this);

        this.layerIndexes = {};
        this.availableImages = {};

        this.workerSourceTypes = {
            vector: VectorTileWorkerSource,
            geojson: GeoJSONWorkerSource
        };

        // [mapId][sourceType][sourceName] => worker source instance
        this.workerSources = {};
        // this.demWorkerSources = {};

        this.self.registerWorkerSource = (name: string, WorkerSource: {
            new (...args: any): WorkerSource;
        }) => {
            if (this.workerSourceTypes[name]) {
                throw new Error(`Worker source with name "${name}" already registered.`);
            }
            this.workerSourceTypes[name] = WorkerSource;
        };
    }

    setReferrer(mapID: string, referrer: string) {
        this.referrer = referrer;
    }

    setImages(mapId: string, images: Array<string>, callback: WorkerTileCallback) {
        this.availableImages[mapId] = images;
        for (const workerSource in this.workerSources[mapId]) {
            const ws = this.workerSources[mapId][workerSource];
            for (const source in ws) {
                ws[source].availableImages = images;
            }
        }
        callback();
    }

    setLayers(mapId: string, layers: Array<LayerSpecification>, callback: WorkerTileCallback) {
        this.getLayerIndex(mapId).replace(layers);
        callback();
    }

    updateLayers(mapId: string, params: {
        layers: Array<LayerSpecification>;
        removedIds: Array<string>;
    }, callback: WorkerTileCallback) {
        this.getLayerIndex(mapId).update(params.layers, params.removedIds);
        callback();
    }

    loadTile(mapId: string, params: WorkerTileParameters & {
        type: string;
    }, callback: WorkerTileCallback) {
        this.getWorkerSource(mapId, params.type, params.source).loadTile(params, callback);
    }


    reloadTile(mapId: string, params: WorkerTileParameters & {
        type: string;
    }, callback: WorkerTileCallback) {
        this.getWorkerSource(mapId, params.type, params.source).reloadTile(params, callback);
    }

    abortTile(mapId: string, params: TileParameters & {
        type: string;
    }, callback: WorkerTileCallback) {
        this.getWorkerSource(mapId, params.type, params.source).abortTile(params, callback);
    }

    removeTile(mapId: string, params: TileParameters & {
        type: string;
    }, callback: WorkerTileCallback) {
        this.getWorkerSource(mapId, params.type, params.source).removeTile(params, callback);
    }

    // removeDEMTile(mapId: string, params: TileParameters) {
    //     this.getDEMWorkerSource(mapId, params.source).removeTile(params);
    // }

    removeSource(mapId: string, params: {
        source: string;
    } & {
        type: string;
    }, callback: WorkerTileCallback) {

        if (!this.workerSources[mapId] ||
            !this.workerSources[mapId][params.type] ||
            !this.workerSources[mapId][params.type][params.source]) {
            return;
        }

        const worker = this.workerSources[mapId][params.type][params.source];
        delete this.workerSources[mapId][params.type][params.source];

        if (worker.removeSource !== undefined) {
            worker.removeSource(params, callback);
        } else {
            callback();
        }
    }

    /**
     * Load a {@link WorkerSource} script at params.url.  The script is run
     * (using importScripts) with `registerWorkerSource` in scope, which is a
     * function taking `(name, workerSourceObject)`.
     */
    loadWorkerSource(map: string, params: {
        url: string;
    }, callback: Callback<void>) {
        try {
            this.self.importScripts(params.url);
            callback();
        } catch (e) {
            callback(e.toString());
        }
    }

    getAvailableImages(mapId: string) {
        let availableImages = this.availableImages[mapId];

        if (!availableImages) {
            availableImages = [];
        }

        return availableImages;
    }

    getLayerIndex(mapId: string) {
        let layerIndexes = this.layerIndexes[mapId];
        if (!layerIndexes) {
            layerIndexes = this.layerIndexes[mapId] = new StyleLayerIndex();
        }
        return layerIndexes;
    }

    getWorkerSource(mapId: string, type: string, source: string) {
        if (!this.workerSources[mapId])
            this.workerSources[mapId] = {};
        if (!this.workerSources[mapId][type])
            this.workerSources[mapId][type] = {};

        if (!this.workerSources[mapId][type][source]) {
            // use a wrapped actor so that we can attach a target mapId param
            // to any messages invoked by the WorkerSource
            const actor = {
                send: (type, data, callback) => {
                    this.actor.send(type, data, callback, mapId);
                }
            };
            this.workerSources[mapId][type][source] = new (this.workerSourceTypes[type] as any)((actor as any), this.getLayerIndex(mapId), this.getAvailableImages(mapId));
        }

        return this.workerSources[mapId][type][source];
    }

}

if (isWorker()) {
    (self as any).worker = new Worker(self as any);
}
