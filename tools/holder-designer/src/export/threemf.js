// 3MF writer and reader. Besides the mesh (in millimetres, which 3MF states
// explicitly, unlike STL) the package carries the design parameters, so a file
// dropped back onto the page restores every slider.
import { zipStore, zipRead } from './zip.js';

const DESIGN_PART = 'Metadata/holder.json';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => Number(v.toFixed(5));

/** @returns Uint8Array of the .3mf package */
export function threeMf({ positions, indices }, title, params) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
    ` <metadata name="Title">${xml(title)}</metadata>\n`,
    ' <metadata name="Application">Holder designer</metadata>\n',
    ' <resources>\n  <object id="1" type="model">\n   <mesh>\n    <vertices>\n',
  ];
  for (let i = 0; i < positions.length; i += 3) {
    out.push(`     <vertex x="${num(positions[i])}" y="${num(positions[i + 1])}" z="${num(positions[i + 2])}"/>\n`);
  }
  out.push('    </vertices>\n    <triangles>\n');
  for (let i = 0; i < indices.length; i += 3) {
    out.push(`     <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>\n`);
  }
  out.push('    </triangles>\n   </mesh>\n  </object>\n </resources>\n <build>\n  <item objectid="1"/>\n </build>\n</model>\n');

  return zipStore([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
        ' <Default Extension="json" ContentType="application/json"/>\n' +
        '</Types>\n',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
        '</Relationships>\n',
    },
    { name: '3D/3dmodel.model', data: out.join('') },
    { name: DESIGN_PART, data: JSON.stringify({ app: 'holder-designer', version: 1, params }, null, 1) },
  ]);
}

/** The parameters stored in a 3MF from this tool, or null. */
export async function readDesign(buffer) {
  const part = await zipRead(buffer, DESIGN_PART);
  if (!part) return null;
  const json = JSON.parse(new TextDecoder().decode(part));
  return json && json.app === 'holder-designer' && json.params ? json.params : null;
}
