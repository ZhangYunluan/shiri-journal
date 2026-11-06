import test from 'node:test';
import assert from 'node:assert/strict';
import {spaceId,databaseName} from '../src/space.mjs';
test('guest database stays intact and different valid IDs use separate local stores',()=>{
  const storage=value=>({getItem:()=>value});
  assert.equal(databaseName(storage(null)),'shiri-life-v1');
  assert.notEqual(databaseName(storage('SR000000000001')),databaseName(storage('SR000000000002')));
  assert.equal(spaceId(storage('../../other')),'guest');
});
