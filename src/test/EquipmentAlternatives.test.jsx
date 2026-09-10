import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EquipmentAlternatives from '../components/EquipmentAlternatives.jsx';
import { equipmentAtGym, gymBrief } from '../gyms.js';

const gyms = [
  { id: 'home', name: 'Home', equipment: [{ id: 'db', name: 'Dumbbells', category: 'Free weights', details: '' }, { id: 'press', name: 'Chest press', category: 'Machines', details: '' }] },
  { id: 'hotel', name: 'Hotel', equipment: [{ id: 'db', name: 'Dumbbells', category: 'Free weights', details: '' }] },
];
function Editor() {
  const [form, setForm] = useState({});
  return <><EquipmentAlternatives gyms={gyms} form={form} setForm={setForm} /><output>{JSON.stringify(form.equipmentAlternatives ?? [])}</output></>;
}

describe('exercise equipment alternatives', () => {
  it('selects and removes alternatives without confusing the same equipment ID across gyms', () => {
    render(<Editor />);
    fireEvent.click(screen.getByLabelText('Home · Dumbbells'));
    fireEvent.click(screen.getByLabelText('Hotel · Dumbbells'));
    expect(screen.getByRole('status').textContent).toBe(JSON.stringify([{ gymId: 'home', equipmentId: 'db' }, { gymId: 'hotel', equipmentId: 'db' }]));
    fireEvent.click(screen.getByLabelText('Home · Dumbbells'));
    expect(screen.getByLabelText('Hotel · Dumbbells')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Hotel · Dumbbells'));
    expect(screen.getByRole('status')).toHaveTextContent('[]');
  });
  it('matches any available alternative only within the routine gym', () => {
    const exercise = { id: 'e1', name: 'Press', equipmentAlternatives: [{ gymId: 'home', equipmentId: 'db' }, { gymId: 'home', equipmentId: 'press' }] };
    expect(equipmentAtGym(exercise, gyms[0])).toBe('Dumbbells OR Chest press');
    expect(equipmentAtGym(exercise, gyms[1])).toBe('No recorded alternative at this gym');
    expect(equipmentAtGym({}, gyms[0])).toBe('No equipment requirement recorded');
    const brief = gymBrief(gyms[1], { name: 'Push', exerciseItems: [{ exerciseId: 'e1', sets: [] }] }, [exercise]);
    expect(brief).toContain('Equipment: No recorded alternative at this gym');
    expect(brief).not.toContain('Chest press');
  });
});
