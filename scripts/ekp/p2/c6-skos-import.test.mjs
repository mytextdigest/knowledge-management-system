import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSkosTurtle,parseSkosRdfXml} from '../../../src/lib/taxonomy/import/skos.mjs';
test('Turtle SKOS labels and hierarchy',()=>{
 const r=parseSkosTurtle(`@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n@prefix ex: <https://example.org/> .\nex:a a skos:Concept ; skos:prefLabel "Root" .\nex:b a skos:Concept ; skos:prefLabel "Child" ; skos:altLabel "Kid" ; skos:broader ex:a .`);
 assert.equal(r.concepts.length,2);assert.equal(r.concepts[1].parentExternalId,'https://example.org/a');assert.deepEqual(r.concepts[1].synonyms,['Kid']);
});
test('RDF/XML SKOS labels and hierarchy',()=>{
 const r=parseSkosRdfXml(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:skos="http://www.w3.org/2004/02/skos/core#"><skos:Concept rdf:about="https://example.org/a"><skos:prefLabel>Root</skos:prefLabel></skos:Concept><skos:Concept rdf:about="https://example.org/b"><skos:prefLabel>Child</skos:prefLabel><skos:broader rdf:resource="https://example.org/a"/></skos:Concept></rdf:RDF>`);
 assert.equal(r.concepts[1].parentExternalId,'https://example.org/a');
});
test('Turtle missing parent rejected',()=>assert.throws(()=>parseSkosTurtle(`@prefix skos: <http://www.w3.org/2004/02/skos/core#> . <urn:a> a skos:Concept ; skos:prefLabel "A" ; skos:broader <urn:missing> .`),/Missing broader/));
test('RDF/XML DTD rejected',()=>assert.throws(()=>parseSkosRdfXml('<!DOCTYPE x><rdf:RDF/>'),/DTD/));
