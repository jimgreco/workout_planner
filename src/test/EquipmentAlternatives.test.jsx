import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EquipmentAlternatives from '../components/EquipmentAlternatives.jsx';
import { equipmentAtGym, gymBrief } from '../gyms.js';

vi.mock('../api.js', () => ({ getEquipment: () => [{ id: 'eq-dumbbells', name: 'Dumbbells', category: 'Free weights', details: '' }, { id: 'eq-press', name: 'Chest press', category: 'Machines', details: '' }] }));

const gyms = [
  { id: 'home', name: 'Home', equipment: [{ id: 'db', name: 'Dumbbells', category: 'Free weights', details: '' }, { id: 'press', name: 'Chest press', category: 'Machines', details: '' }] },
  { id: 'hotel', name: 'Hotel', equipment: [{ id: 'db', name: 'Dumbbells', category: 'Free weights', details: '' }] },
];
function Editor() {
  const [form, setForm] = useState({});
  return <><EquipmentAlternatives gyms={gyms} form={form} setForm={setForm} /><output>{JSON.stringify(form.equipmentAlternatives ?? [])}</output></>;
}

describe('exercise equipment alternatives', () => {
  it('selects equipment once for use across gyms', () => {
    render(<Editor />);
    fireEvent.click(screen.getByLabelText('Dumbbells'));
    fireEvent.click(screen.getByLabelText('Chest press'));
    expect(screen.getByRole('status').textContent).toBe(JSON.stringify([{ equipmentId: 'eq-dumbbells' }, { equipmentId: 'eq-press' }]));
    fireEvent.click(screen.getByLabelText('Dumbbells'));
    expect(screen.getByLabelText('Chest press')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Chest press'));
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

it('matches library references at every gym that records the equipment', () => {
  const exercise = { equipmentAlternatives: [{ equipmentId: 'eq-dumbbells' }] };
  const home = { id: 'home', equipment: [{ id: 'home-db', equipmentId: 'eq-dumbbells', name: 'Dumbbells' }] };
  const hotel = { id: 'hotel', equipment: [{ id: 'hotel-db', equipmentId: 'eq-dumbbells', name: 'Dumbbells' }] };
  expect(equipmentAtGym(exercise, home)).toBe('Dumbbells');
  expect(equipmentAtGym(exercise, hotel)).toBe('Dumbbells');
  expect(equipmentAtGym(exercise, { id: 'empty', equipment: [] })).toBe('No recorded alternative at this gym');
});
