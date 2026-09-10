export default function EquipmentAlternatives({ form, setForm, gyms }) {
  const refs = form.equipmentAlternatives ?? [];
  const choices = gyms.flatMap((gym) => gym.equipment.map((item) => ({ gymId: gym.id, equipmentId: item.id, label: `${gym.name} · ${item.name}` })));
  const missing = refs.filter((ref) => !choices.some((choice) => choice.gymId === ref.gymId && choice.equipmentId === ref.equipmentId));
  function toggle(ref, checked) {
    const next = checked ? [...refs, { gymId: ref.gymId, equipmentId: ref.equipmentId }] : refs.filter((entry) => entry.gymId !== ref.gymId || entry.equipmentId !== ref.equipmentId);
    setForm({ ...form, equipmentAlternatives: next });
  }
  return <fieldset className="equipment-alternatives">
    <legend>Equipment alternatives</legend>
    <p className="text-muted">Select any equipment that can be used for this exercise. Each selection is an alternative, not a requirement to use everything together. Leave empty if no requirement is recorded.</p>
    {!choices.length && <p className="text-muted">Add equipment in Gyms to associate it with this exercise.</p>}
    {choices.map((choice) => {
      const checked = refs.some((ref) => ref.gymId === choice.gymId && ref.equipmentId === choice.equipmentId);
      return <label className="checkbox-row" key={`${choice.gymId}/${choice.equipmentId}`}><input type="checkbox" checked={checked} disabled={!checked && refs.length >= 100} onChange={(event) => toggle(choice, event.target.checked)} />{choice.label}</label>;
    })}
    {missing.map((ref) => <label className="checkbox-row" key={`${ref.gymId}/${ref.equipmentId}`}><input type="checkbox" checked onChange={() => toggle(ref, false)} />Unavailable equipment ({ref.gymId} / {ref.equipmentId}) — uncheck to remove</label>)}
  </fieldset>;
}
