import test from "node:test";import assert from "node:assert/strict";import {relationshipConfidence,classifyRelationship,RELATIONSHIP_SIGNAL_WEIGHTS} from "../../src/lib/relationshipScoringPolicy.mjs";
test("multi-signal evidence can clear confidence without embedding similarity",()=>{const score=relationshipConfidence({embeddingSimilarity:0,topicOverlap:1,entityOverlap:1,projectContext:1,lessonEvidence:0});assert.ok(score>=0.32);});
test("weights are centralized and bounded",()=>{assert.equal(Object.values(RELATIONSHIP_SIGNAL_WEIGHTS).reduce((a,b)=>a+b,0),1);assert.ok(relationshipConfidence({embeddingSimilarity:2})<=1);});
test("taxonomy never creates contradicts",()=>{for(const signals of [{lessonEvidence:1},{projectContext:1},{entityOverlap:1},{topicOverlap:1},{}])assert.notEqual(classifyRelationship({signals}),"contradicts");});

test("legacy 0.72 embedding-only relationships remain above v1 threshold",()=>{assert.ok(relationshipConfidence({embeddingSimilarity:0.72})>=0.32);});
