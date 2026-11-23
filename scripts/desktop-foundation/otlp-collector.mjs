// Owned namespace-local test collector. This is never loaded by the application.
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import protobuf from 'protobufjs'
const output=process.argv[2],ready=process.argv[3]
const type=protobuf.parse(`syntax="proto3";
message Value { string stringValue=1; }
message Attribute { string key=1; Value value=2; }
message Resource { repeated Attribute attributes=1; }
message Span { bytes traceId=1; bytes spanId=2; string name=5; fixed64 startTimeUnixNano=7; fixed64 endTimeUnixNano=8; }
message ScopeSpans { repeated Span spans=2; }
message ResourceSpans { Resource resource=1; repeated ScopeSpans scopeSpans=2; }
message Request { repeated ResourceSpans resourceSpans=1; }`).root.lookupType('Request')
const requests=[]
createServer((request,response)=>{
 const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
  try {requests.push({url:request.url,contentType:request.headers['content-type'],decoded:type.toObject(type.decode(Buffer.concat(chunks)),{longs:String,bytes:String,arrays:true,defaults:true})});writeFileSync(output,JSON.stringify(requests));response.writeHead(200).end()}
  catch {response.writeHead(400).end()}
 })
}).listen(43180,'127.0.0.1',()=>writeFileSync(ready,'ready'))
