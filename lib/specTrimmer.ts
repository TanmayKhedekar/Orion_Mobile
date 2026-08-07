export function aggressiveTrimSpec(spec: any, maxEndpoints: number = 15): any {
  if (!spec || !spec.paths) return spec;
  
  const paths = Object.entries(spec.paths);
  const trimmedPaths: any = {};
  let endpointCount = 0;

  for (const [path, methods] of paths) {
    if (endpointCount >= maxEndpoints) break;
    trimmedPaths[path] = {};
    
    for (const [method, details] of Object.entries(methods as any)) {
      if (!['get','post','put','delete','patch'].includes(method.toLowerCase())) continue;
      if (endpointCount >= maxEndpoints) break;
      
      const d = details as any;
      trimmedPaths[path][method.toLowerCase()] = {
        summary: d.summary || '',
        operationId: d.operationId || '',
        parameters: (d.parameters || []).slice(0, 5).map((p: any) => ({
          name: p.name,
          in: p.in,
          required: p.required || false,
          type: p.schema?.type || p.type || 'string'
        })),
        hasBody: !!(d.requestBody),
        responses: Object.keys(d.responses || {}).slice(0, 3)
      };
      endpointCount++;
    }
  }

  return {
    title: spec.info?.title || 'API',
    version: spec.info?.version || '1.0',
    baseUrl: spec.servers?.[0]?.url || spec.host || '',
    paths: trimmedPaths
  };
}
