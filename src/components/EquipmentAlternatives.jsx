import { useState } from 'react';
import { getEquipment } from '../api.js';
import EquipmentLibrary from './EquipmentLibrary.jsx';

export default function EquipmentAlternatives({ form, setForm, gyms = [] }) {
  const [library, setLibrary] = useState(getEquipment);
  const refs = form.equipmentAlternatives ?? [];
  function toggle(entry) {
    const selected = refs.some((ref) => !ref.gymId && ref.equipmentId === entry.id);
    setForm({ ...form, equipmentAlternatives: selected ? refs.filter((ref) => ref.gymId || ref.equipmentId !== entry.id) : refs.length < 100 ? [...refs, { equipmentId: entry.id }] : refs });
  }
  return <fieldset className="equipment-alternatives">
    <legend>Equipment alternatives</legend>
    <p className="text-muted">Select equipment that can be used for this exercise. Each selection is an alternative. Leave empty when no equipment is selected.</p>
    <EquipmentLibrary equipment={library} onUpdate={setLibrary} selectedIDs={refs.filter((ref) => !ref.gymId).map((ref) => ref.equipmentId)} onSelect={toggle} />
    {refs.filter((ref) => ref.gymId || !library.some((entry) => entry.id === ref.equipmentId)).map((ref) => {
      const gym = gyms.find((gym) => gym.id === ref.gymId);
      const item = gym?.equipment.find((item) => item.id === ref.equipmentId);
      return <label className="checkbox-row" key={`${ref.gymId}/${ref.equipmentId}`}><input type="checkbox" checked onChange={() => setForm({ ...form, equipmentAlternatives: refs.filter((entry) => entry !== ref) })} />{item ? `${gym.name} · ${item.name}` : `Unavailable equipment (${ref.equipmentId})`} — uncheck to remove</label>;
    })}
  </fieldset>;
}
