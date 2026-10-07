import {beforeEach, describe, expect, it, vi} from 'vitest';
import request from 'supertest';

const db = vi.hoisted(() => ({
  user: {findUnique:vi.fn()}, placeManager:{findUnique:vi.fn()},
  category:{count:vi.fn()}, place:{findUnique:vi.fn(),update:vi.fn()},
}));
vi.mock('../src/db',()=>({prisma:db}));
vi.mock('../src/config',()=>({config:{NODE_ENV:'test',JWT_SECRET:'test-secret-not-used-by-auth-mock-123456',CORS_ORIGIN:'*'}}));
vi.mock('../src/auth',()=>({requireAuth:(req:any,res:any,next:any)=>{
  if(!req.headers.authorization) return res.sendStatus(401);
  req.userId=10; next();
},createSessionTokens:vi.fn(),rotateRefreshToken:vi.fn(),revokeRefreshToken:vi.fn(),signReservationTicket:vi.fn(),verifyReservationTicket:vi.fn()}));
import {app} from '../src/app';
const payload={name:'Le Patio',categoryIds:[1],latitude:36.8,longitude:10.1,capacityPerSlot:20};
let place:any;
beforeEach(()=>{
  vi.clearAllMocks();
  place={id:7,name:'Le Patio',categoryId:1,categories:[{categoryId:1}],media:[],events:[],reviews:[],reviewsEnabled:true,image:'https://example.com/original.jpg',happyHour:'17:00–19:00'};
  db.user.findUnique.mockResolvedValue({role:'ESTABLISHMENT'});
  db.placeManager.findUnique.mockResolvedValue({id:1});
  db.category.count.mockResolvedValue(1);
  db.place.findUnique.mockImplementation(async()=>place);
  db.place.update.mockImplementation(async({data}:any)=>{
    for(const [key,value] of Object.entries(data)) if(value!==undefined && key!=='categories') place[key]=value;
    return place;
  });
});
const save=(body:object)=>request(app).put('/pro/places/7').set('Authorization','Bearer manager').send(body);
describe('HTTP Pro to Barmej profile flow',()=>{
  it('makes a Pro offer and photo immediately available to the consumer detail endpoint',async()=>{
    const saved=await save({...payload,happyHour:'Nouvelle offre',image:'https://example.com/new.jpg'});
    expect(saved.status).toBe(200);
    const client=await request(app).get('/getPlaceInfoByIdPlace/7');
    expect(client.status).toBe(200);
    expect(client.body.place).toMatchObject({idPlace:7,image:'https://example.com/new.jpg',placeHappyHour:'Nouvelle offre'});
    expect(client.body.placeinfo.placeHappyHour).toBe('Nouvelle offre');
  });
  it('keeps the current offer for an older client, but accepts explicit removal',async()=>{
    expect((await save(payload)).status).toBe(200);
    expect(place.happyHour).toBe('17:00–19:00');
    expect(place.image).toBe('https://example.com/original.jpg');
    expect((await save({...payload,happyHour:''})).status).toBe(200);
    expect(place.happyHour).toBeNull();
  });
  it('rejects a manager from another establishment without changing its data',async()=>{
    db.placeManager.findUnique.mockResolvedValue(null);
    expect((await save({...payload,happyHour:'Not allowed'})).status).toBe(403);
    expect(db.place.update).not.toHaveBeenCalled();
  });
});
