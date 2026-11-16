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
test('Turtle broader concept outside the file: imported at the top level with a warning',()=>{
 const r=parseSkosTurtle(`@prefix skos: <http://www.w3.org/2004/02/skos/core#> . <urn:a> a skos:Concept ; skos:prefLabel "A" ; skos:broader <urn:missing> .`);
 assert.equal(r.concepts[0].parentExternalId,null);assert.match(r.warnings[0],/isn't in the file/);
});
const P='@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n@prefix skosxl: <http://www.w3.org/2008/05/skos-xl#> .\n@prefix dct: <http://purl.org/dc/terms/> .\n@prefix ex: <http://ex.org/t/> .\n';
test('Turtle export features: languages, typed and numeric literals, long strings, blank nodes, @base',()=>{
 const r=parseSkosTurtle(P+`@base <http://ex.org/t/> .
ex:s a skos:ConceptScheme ; skos:prefLabel "Enterprise"@en .
<a> a skos:Concept ; skos:inScheme ex:s ; skos:prefLabel "Transformateur"@fr , "Transformer"@en ; skos:altLabel "XFMR"@en , "Trafo"@de ;
  skos:definition """Steps
voltage""" ; dct:modified "2024-01-01"^^<http://www.w3.org/2001/XMLSchema#date> ; ex:rank 3 ; ex:weight 2.5 ; ex:ok true ; ex:meta [ ex:by 'tool' ] .
ex:b a skos:Concept ; skos:prefLabel "Bushing" ; skos:broader <a> ; skos:related <a> .`);
 assert.deepEqual(r.concepts.map(c=>c.label),['Transformer','Bushing']);
 assert.deepEqual(r.concepts[0].synonyms,['XFMR']);
 assert.equal(r.concepts[0].description,'Steps\nvoltage');
 assert.equal(r.concepts[1].parentExternalId,'http://ex.org/t/a');
 assert.deepEqual(r.concepts[1].relatedExternalIds,['http://ex.org/t/a']);
 assert.equal(r.schemeLabel,'Enterprise');
});
test('SKOS-XL labels (blank node and label resource)',()=>{
 const r=parseSkosTurtle(P+'ex:a a skos:Concept ; skosxl:prefLabel [ skosxl:literalForm "Asset"@en ] ; skosxl:altLabel ex:l1 .\nex:l1 a skosxl:Label ; skosxl:literalForm "Equipment"@en .');
 assert.equal(r.concepts[0].label,'Asset');assert.deepEqual(r.concepts[0].synonyms,['Equipment']);
});
test('polyhierarchy keeps the first broader concept and warns',()=>{
 const r=parseSkosTurtle(P+'ex:p1 a skos:Concept ; skos:prefLabel "P1" . ex:p2 a skos:Concept ; skos:prefLabel "P2" . ex:c a skos:Concept ; skos:prefLabel "C" ; skos:broader ex:p1 , ex:p2 .');
 assert.equal(r.concepts[2].parentExternalId,'http://ex.org/t/p1');assert.match(r.warnings[0],/2 broader/);
});
test('RDF/XML: declaration, rdf:Description + rdf:type, other namespaces, nested narrower, entities',()=>{
 const r=parseSkosRdfXml(`<?xml version="1.0" encoding="UTF-8"?>
<!-- export -->
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:skos="http://www.w3.org/2004/02/skos/core#" xmlns:dct="http://purl.org/dc/terms/" xml:base="http://ex.org/">
 <rdf:Description rdf:about="a"><rdf:type rdf:resource="http://www.w3.org/2004/02/skos/core#Concept"/><skos:prefLabel xml:lang="en">Health &amp; Safety</skos:prefLabel><dct:created>2024</dct:created>
  <skos:narrower><skos:Concept rdf:about="b"><skos:prefLabel xml:lang="en">PPE</skos:prefLabel><skos:hiddenLabel xml:lang="en">personal protective equipment</skos:hiddenLabel></skos:Concept></skos:narrower>
 </rdf:Description>
</rdf:RDF>`);
 assert.deepEqual(r.concepts.map(c=>[c.label,c.parentExternalId]),[['Health & Safety',null],['PPE','http://ex.org/a']]);
 assert.deepEqual(r.concepts[1].hiddenLabels,['personal protective equipment']);
});
test('a concept without any label is an error',()=>assert.throws(()=>parseSkosTurtle(P+'ex:a a skos:Concept .'),/no prefLabel/));
test('cycles are an error',()=>assert.throws(()=>parseSkosTurtle(P+'ex:a a skos:Concept ; skos:prefLabel "A" ; skos:broader ex:b . ex:b a skos:Concept ; skos:prefLabel "B" ; skos:broader ex:a .'),/Cycle/));
test('RDF/XML DTD rejected',()=>assert.throws(()=>parseSkosRdfXml('<!DOCTYPE x><rdf:RDF/>'),/DTD/));
