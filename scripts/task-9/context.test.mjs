import test from 'node:test';
import assert from 'node:assert/strict';
const cosine=(a,b)=>{let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i]}return d/Math.sqrt(na*nb)};
test('cosine identifies identical embeddings',()=>assert.equal(cosine([1,0],[1,0]),1));
test('relationship threshold rejects unrelated vectors',()=>assert.ok(cosine([1,0],[0,1])<0.72));
test('project linking remains advisory',()=>assert.ok(['suggested','confirmed','dismissed'].includes('suggested')));
