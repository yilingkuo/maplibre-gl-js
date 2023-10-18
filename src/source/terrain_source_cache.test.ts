import {TerrainSourceCache} from './terrain_source_cache';
import {Style} from '../style/style';
import {RequestManager} from '../util/request_manager';
// import {Dispatcher} from '../util/dispatcher';
import {fakeServer, type FakeServer} from 'nise';
import {Transform} from '../geo/transform';
import {Evented} from '../util/evented';
import {Painter} from '../render/painter';
import {OverscaledTileID} from './tile_id';
import {Tile} from './tile';
// import {DEMData} from '../data/dem_data';

const transform = new Transform();

class StubMap extends Evented {
    transform: Transform;
    painter: Painter;
    _requestManager: RequestManager;

    constructor() {
        super();
        this.transform = transform;
        this._requestManager = {
            transformRequest: (url) => {
                return {url};
            }
        } as any as RequestManager;
    }

    _getMapId() {
        return 1;
    }

    setTerrain() {}
}



describe('TerrainSourceCache', () => {
    let server: FakeServer;
    let style: Style;
    let tsc: TerrainSourceCache;

    beforeAll(done => {
        global.fetch = null;
        server = fakeServer.create();
        server.respondWith('/source.json', JSON.stringify({
            minzoom: 5,
            maxzoom: 12,
            attribution: 'MapLibre',
            tiles: ['http://example.com/{z}/{x}/{y}.pngraw'],
            bounds: [-47, -7, -45, -5]
        }));
        const map = new StubMap();
        style = new Style(map as any);

        style.loadJSON({
            'version': 8,
            'sources': {},
            'layers': []
        });
    });

    afterAll(() => {
        server.restore();
    });

    test('#constructor', () => {
        expect(tsc.sourceCache.usedForTerrain).toBeTruthy();
        expect(tsc.sourceCache.tileSize).toBe(tsc.tileSize * 2 ** tsc.deltaZoom);
    });

    test('#getSourceTile', () => {
        const tileID = new OverscaledTileID(5, 0, 5, 17, 11);
        const tile = new Tile(tileID, 256);
        // tile.dem = {} as DEMData;
        tsc.sourceCache._tiles[tileID.key] = tile;
        expect(tsc.deltaZoom).toBe(1);
        expect(tsc.getSourceTile(tileID)).toBeFalsy();
        expect(tsc.getSourceTile(tileID.children(12)[0])).toBeTruthy();
        expect(tsc.getSourceTile(tileID.children(12)[0].children(12)[0])).toBeFalsy();
        expect(tsc.getSourceTile(tileID.children(12)[0].children(12)[0], true)).toBeTruthy();
    });

});
