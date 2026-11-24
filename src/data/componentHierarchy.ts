export interface SubComponentEntry {
  name: string;
  details: string[];
}

export interface ComponentEntry {
  name: string;
  subComponents: SubComponentEntry[];
}

export const COMPONENT_HIERARCHY: ComponentEntry[] = [
  {
    name: 'ENGINE',
    subComponents: [
      {
        name: 'Air Intake & Exhaust System',
        details: [
          'Air Intake Manifold & After Cooler',
          'Air Cleaner & Fitting Parts',
          'Turbocharger',
          'Exhaust Manifold & Muffler',
          'Exhaust Brake & Cylinder',
          'Engine Brake Retarder',
          'Exhaust Pipe, Stack & Muffler',
        ],
      },
      {
        name: 'Fuel System',
        details: [
          'Fuel Pump & Mounting',
          'Priming Pump',
          'Fuel Nozzle/Injector',
          'Fuel Pump Coupling',
          'Float Tank & Breather',
          'Quick Start System',
          'Fast Fuel Filler',
        ],
      },
      {
        name: 'Cooling System',
        details: [
          'Radiator & Resevoir Tank',
          'Water Pump',
          'Cooling Fan & Belt',
          'Tension Pulley & Fitting Parts',
          'Corrosion Resistor & Piping',
          'Water Manifold & Thermostat',
          'Water Heater & Piping',
          'Radiator Hose & Line',
          'Radiator Wind Break & Seal',
          'Radiator Fan Guard & Pulley',
          'Oil Cooler & Piping',
          'Radiator Shutter & Control Level',
          'Radiator Grill and Mask',
        ],
      },
      {
        name: 'Lube System',
        details: [
          'Oil Pump & Suction Pipe',
          'Fast Lube Filler',
          'Filter Assy',
          'Lub. Oil Piping & Jet Nozzle',
          'Lublicating Oil Cooler',
        ],
      },
      {
        name: 'Starting System',
        details: ['Starting Motor & Mounting', 'Safety Relay', 'Starting Switch'],
      },
      {
        name: 'Charging System',
        details: ['Alternator & Mounting', 'Regulator', 'Alternator Drive'],
      },
      {
        name: 'Cylinder Head Group',
        details: [
          'Cylinder Head & Fitting Parts',
          'Valve Mechanism',
          'Rocker Arm, Housing & Cover',
        ],
      },
      {
        name: 'Engine Block Group',
        details: [
          'Cylinder Block & Liner',
          'Block Covers',
          'Front Cover & Support',
          'Timing Gear & Idle Gear',
          'Crank Case & Breather',
          'Flywheel & Housing',
          'Crankshaft & Damper Pulley',
          'Piston & Connecting Rod',
          'Camshaft & Follower',
          'Valve & Giude',
          'Accessories Drive',
          'Mounting Parts',
          'Oil Pan',
        ],
      },
      {
        name: 'Engine Related',
        details: ['Engine Mounting'],
      },
    ],
  },
  {
    name: 'HYDRAULIC SYSTEM',
    subComponents: [
      {
        name: 'Hydraulic Pump',
        details: ['Main Pump', 'Acc. Pump', 'Others'],
      },
      {
        name: 'Control Valve & Other Valves',
        details: ['OLSS system', 'CLLS System'],
      },
      {
        name: 'Hyd. Actuator',
        details: [
          'Hyd. Motor',
          'Hydraulic Oil Cooler',
          'Hyd. Oil Hose, Piping',
          'Hydraulic Filters',
          'Fan Motor',
          'Hyd. Cylinder / Dump Hoist',
        ],
      },
      {
        name: 'TVC Valve & Servo Valve',
        details: ['TVC Piping / Lines'],
      },
      {
        name: 'Accumulator',
        details: ['Accumulator'],
      },
      {
        name: 'Swivel Circle',
        details: ['Swing Machinery', 'Swing Motor', 'Swivel Joint'],
      },
      {
        name: 'Hydraulic Tank',
        details: ['Hydraulic Tank'],
      },
    ],
  },
  {
    name: 'TRANSMISSION & TORQUE CODE',
    subComponents: [
      {
        name: 'Clutch & Torque Converter System',
        details: [
          'Main Clutch',
          'Clutch Case & Housing',
          'Main Clutch Inner Parts',
          'Inertia Brake',
          'Clutch Control',
          'Clutch Pedal & Linkage',
          'Clutch Piping',
          'Release Bearing & Fitting Parts',
          'Clutch Booster',
          'Torque Converter',
          'T/C Case & Fitting Parts',
          'T/C Inner Parts & Lock Up Clutch',
          'Scavenging Pump',
          'T/C Oil Filter',
          'T/C Valves',
          'T/C Oil Piping , Hose',
          'Damper',
          'Damper Case',
          'Damper Inner Parts',
          'Propeller Shaft',
          'Center Bearing',
          'Universal Joint',
          'PTO',
          'PTO Assembly',
          'PTO Coupling',
          'Fast Lube filler assy',
          'PTO Lubricating',
          'PTO Hose, Piping',
        ],
      },
      {
        name: 'Transmission System',
        details: [
          'Cooling System',
          'T/M Case & Mounting',
          'T/M Inner Parts',
          'T/M Pump Valves',
          'T/M Clucth & disc system',
          'T/M Input shaft gear system',
          'T/M Main Shaft Gear system',
          'T/M Output shaft gear sysem',
          'T/M Planetary gear sysem',
          'Transmission Control',
          'T/M Control Valves',
          'T/M Control Lever & Linkage',
          'Inching System',
          'T/M Pump',
          'T/M Oil Piping & Hose',
          'T/M Oil Filter',
          'Transfer/Drop Box',
          'T/F Case & Mounting',
          'T/F Gear & Output Shaft',
          'Transfer/DB Control & Linkage',
        ],
      },
      {
        name: 'Cooling System',
        details: ['Oil Cooler'],
      },
    ],
  },
  {
    name: 'DIFFERENTIAL & FINAL DRIVE',
    subComponents: [
      {
        name: 'Tandem Drive',
        details: ['Tandem Drive Case', 'Tandem Drive Gear & Chain'],
      },
      {
        name: 'Differential',
        details: [
          'Differential Case',
          'Diff. Inner Parts & Drive Shaft',
          'Differential Lock',
          'Front Axle',
          'Middle Axle',
          'Rear Axle',
        ],
      },
      {
        name: 'Final Drive',
        details: [
          'Drive Case & Fitting Parts',
          'Drive Gear & Sprocket',
          'Travel / Traming Motor & Fitting Parts',
          'Travel Piping, Drain Piping & Hose',
          'Planetary Gear Unit',
          'Travel Gear Box',
          'Travel Motor',
          'Bevel Gear',
        ],
      },
    ],
  },
  {
    name: 'BRAKING & STEERING SYSTEM',
    subComponents: [
      {
        name: 'Brake System',
        details: [
          'Brake Pump',
          'Front Brake',
          'Rear Brake',
          'Slack Adjuster & Fitting parts',
          'Fuel Piping & Filters',
          'Brake Chamber & Fitting parts',
          'Brake Oil Cooler',
          'Brake Drum & Brake Band',
          'Piston Brake',
          'Disk and Plate',
          'Brake Clutch',
        ],
      },
      {
        name: 'Brake Control',
        details: [
          'Brake Pedal / Lever & Linkage',
          'Reservoir & Master Cylinder',
          'Brake Cylinder',
          'Brake Cooling',
          'Treadle & Relay Valve',
          'Brake Valves',
          'Brake Oil Hose, Piping',
        ],
      },
      {
        name: 'Steering System',
        details: [
          'Steering Pump',
          'Steering Valve',
          'Steering Filters & Reservoir',
          'Steering Piping , Hose',
          'Steering Demand Valve',
          'Steering, Leaning, Articulate Cylinder',
          'Steering Cylinder',
          'Emergency Steering Motor',
          'Steering Case & Cover',
          'Steering Bevel Gear & Shaft',
          'Steering Clutch',
        ],
      },
      {
        name: 'Steering Control',
        details: [
          'Steering Wheel & Column',
          'Steering Linkage',
          'Steering Gear Box & Booster',
          'Knuckle & Tie Rod',
        ],
      },
    ],
  },
  {
    name: 'UNDERCARRIAGE & TIRE',
    subComponents: [
      {
        name: 'Undercarriage Group',
        details: [
          'Recoil Spring',
          'HIC / Track Adjuster',
          "Track Shoe Ass'y",
          'Yoke',
          'Idler',
          'Roller & Guard',
          'Guard Roller',
          'Track Roller',
          'Track Link',
          'Drive Tumbler',
          'Carrier Roller',
          'Equalizer Bar',
        ],
      },
      {
        name: 'Bogie & Pin',
        details: ['Link pad & Fitting parts', "Sprocket Ass'y", 'Track Frame'],
      },
      {
        name: 'Tire Group',
        details: [
          'Hub',
          "Rim Ass'y",
          'Tyre',
          'Rim Base',
          'Flange / Side Ring',
          'Lock Ring',
          'Spacer',
          'Wedge Band / Lock Rim',
          'Bead Seat Band',
          'Bolt / Mounting Rim & Tyre',
          'O-Ring Tyre',
          'Roller Drum & Fitting Parts',
          'Wheel Brake assy',
          'Springs',
        ],
      },
      {
        name: 'Suspension & Spring System',
        details: [
          'Front Suspension / Spring',
          'U-Bolt Spring',
          'Rear Suspension / Spring',
          'Hollow Spring',
          'Trunion & Spring Seat',
          'Pin Spring',
          'Rubber Boggie',
          'Spring & Shock Absorber',
          'Torq Rod & Stabilizer',
          'Auto Suspension',
          'Suspension Cylinder',
        ],
      },
    ],
  },
  {
    name: 'PNEUMATIC SYSTEM',
    subComponents: [
      { name: 'Compressor', details: ['Compressor'] },
      {
        name: 'Air Valves',
        details: ['Air relay valve', 'Air Governor', 'Air Cylinder'],
      },
      { name: 'Motor', details: ['Motor'] },
      { name: 'Electrical', details: ['Electrical'] },
      {
        name: 'Air Piping and Hose',
        details: ['Air Recervoir Tank / Separator Tank'],
      },
      { name: 'Oiler / Oil Flasher', details: ['Oiler / Oil Flasher'] },
      { name: 'Air Driyer', details: ['Air Driyer'] },
      { name: 'Accumulator', details: ['Accumulator'] },
    ],
  },
  {
    name: 'ELECTRICAL SYSTEM',
    subComponents: [
      {
        name: 'Electric & Monitor Panel',
        details: ['Electric & Monitor Panel'],
      },
      {
        name: 'Monitor Panel & Related Parts',
        details: ['Monitor Panel & Related Parts'],
      },
      { name: 'Electric Panel', details: ['Electric Panel'] },
      { name: 'Relay Box', details: ['Relay Box'] },
      {
        name: 'APS Control Unit',
        details: [
          'Electrical Controller',
          'Engine Electric Control',
          'Transmission electrical control / ECMV',
          'Hyd. Electrical Control',
          'Work Equipment Electrical Control',
          'Auto Deccelerator & Fitting Parts',
          'Engine Stop Motor',
          'Boom Kick Out',
          'Bucket Positioner',
          'Safety & Hazard',
        ],
      },
      {
        name: 'Strobe / Signal Lamp',
        details: [
          'Rotary Lamp',
          'Move / Back Alarm',
          'Fatique warning',
          'Emergency shut down',
          'Lock Out Switch',
          'General Electric',
        ],
      },
      {
        name: 'Fuse Box',
        details: ['Electric box', 'Relay & sensor', 'Selenoid'],
      },
      {
        name: 'Lighting System',
        details: ['Head Lamp', 'Signal lamp'],
      },
      {
        name: 'Accesories',
        details: ['Motor & Wiper', 'Connector'],
      },
      {
        name: 'Battery',
        details: ['Battery', 'Battery Rellay', 'Terminal'],
      },
      {
        name: 'Genset Attachement',
        details: ['Generator', 'Electric AC / DC panel', 'AVR', 'PMG'],
      },
      {
        name: 'Tower lamp Attachement',
        details: ['Lamp', 'Tower', 'Ballast', 'Tower Winch'],
      },
    ],
  },
  {
    name: 'GENERAL (ATTACHMENT, CHASSIS)',
    subComponents: [
      {
        name: 'Cabin & Canopy',
        details: [
          'Roops Mount & Canopy',
          'Operator Compartement / Cab',
          'Cab Operator Seat',
          'Console Box / Display Control Unit',
          'Cab Lifting System',
          'Cab Window Regulator / Power Window',
        ],
      },
      {
        name: "Blade Ass'y",
        details: ['Cutting Edge', 'Side Edge / End Bit', 'Arm Blade'],
      },
      {
        name: 'Grader attachment',
        details: ['Circle & Drawbar', 'Artic, Pin & Bushing', 'Cylinder Hyd assy'],
      },
      {
        name: 'Boom, Arm, & Bucket',
        details: [
          'Tooth Bucket Adapter',
          'Tooth Bucket',
          'Lip Shroud & Vertical Shroud',
          'Wear Plate Bucket',
          'Pin & Bushing',
          'Boom & Arm',
          'Cylinder Hyd Assy Bucket',
          'Cylinder Hyd Assy Arm',
          'Cylinder Hyd Assy Boom',
        ],
      },
      {
        name: 'Fork Assy',
        details: ['Cylinder Hyd Assy Fork', 'Mast Assy', 'Fork'],
      },
      {
        name: 'Tire Handler',
        details: ["Hydraulic Cyl Ass'y"],
      },
      {
        name: 'Ripper',
        details: [
          'Cylinder Hyd assy Ripper Lift',
          'Cylinder Hyd assy Ripper Tilt',
          'Shank Ripper',
          'Protector Shank Ripper',
          'Point Ripper',
          'Pin Point & Protector Ripper',
        ],
      },
      {
        name: 'Drilling Attachement',
        details: [
          'Air end Compressor',
          'Gear Box',
          'Rotary Head',
          'Rotary Joint',
          'Rotary Valve',
          'Rotation Mechanism',
          'Down Hole Drill',
          'Chain and Wire Rop',
          'Buttom Bit/Trycone Bit',
          'Shank Bar / Adapter',
          'Topsub / Bitsub',
          'Coupling',
          'Drill Pipe & Hose',
          'Hydraulic Cylinder',
          'Air / Hyd Motor',
          'Accumulator',
          'Chain Feed & Mast',
          'Fix Jaw Selector',
          'Pipe Rack / Carausel & Rod Changer',
          'Drill Carriage & Pulley',
          'Popet Valve',
          'Buterflay Valve',
          'Rock Drill',
          'Steel Holder / Retaining',
        ],
      },
      {
        name: 'Water Pump Mining Attacment',
        details: [
          'Water Pump',
          'Impeler',
          'Vacum Pump',
          'Valve Inlet',
          'Boom Valve Inlet',
          'Booster Pump',
          'Bare Shaft',
          'Suction Line',
          'Ponton & Canopy',
        ],
      },
      {
        name: 'Vessel Assy',
        details: [
          'Tail gate',
          'Linkage & Spring Tail Gate',
          'Mud Guard',
          'Rubber Pad & Shim',
          'Rock Ejector',
          'Plate Body Vessel',
        ],
      },
      { name: 'Counter Weight', details: ['Counter Weight'] },
      { name: 'Chassis', details: ['Chassis'] },
      { name: 'Fifth Wheel', details: ['Fifth Wheel'] },
    ],
  },
  {
    name: 'ACCESSORIES',
    subComponents: [
      {
        name: 'Air Condition',
        details: ['Condensor', 'Compressor', 'Evaporator', 'Blower', 'Piping & Hose'],
      },
      { name: 'Payload Meter', details: ['Payload Meter'] },
      {
        name: 'AutoLube System',
        details: [
          'Pump Auto lube',
          'Tank Auto lube',
          'Valve Auto Lube',
          'Nozzle & Injector Auto Lube',
          'Nipple Auto Lube',
        ],
      },
      {
        name: 'Auto Fire Suppression',
        details: [
          'Detonator Fire Suppression',
          'Control panel Fire Suppression',
          'Tank Fire Suppression',
          'Sensor Fire Suppression',
          'Nozzle & Injectors',
          'Piping & Hose Fire Suppression',
          'Nozzel Fire Suppression',
          'Foam Fire Suppression',
          'Auto Priming & Start Solenoid / APS',
        ],
      },
      {
        name: 'Water Pump WT Attachment',
        details: [
          'Motor / Pump Hydrolik',
          'Coupling Motor / Pump Hydraulic',
          'Water Sprayer',
          'Piping & Hose',
          'Water Canon',
          'Gun Sprayer',
          'Automatic timer',
        ],
      },
      {
        name: 'Tank Attachment (WT, FT, LT)',
        details: ['Bolt Chasis', 'Sub Frame'],
      },
      {
        name: 'Crane Attachment',
        details: [
          'Boom',
          'Arm',
          'Hock',
          'Cylinder Boom Crane',
          'Cylinder Arm Crane',
          'Controler Crane',
          'Piping & Hose Crane',
        ],
      },
    ],
  },
  {
    name: 'SCHEDULE MAINTENANCE',
    subComponents: [
      {
        name: 'PERIODIC SERVICE',
        details: ['PS 250', 'PS 500', 'PS 1000', 'PS 2000', 'PS 4000', 'General Service'],
      },
      { name: 'PERIODIC INSPECTION', details: ['PERIODIC INSPECTION'] },
      { name: 'BACKLOG', details: ['BACKLOG'] },
      { name: 'PAP', details: ['PAP'] },
      { name: 'PPM', details: ['PPM'] },
      { name: 'PPU', details: ['PPU'] },
      { name: 'PPA', details: ['PPA'] },
      { name: 'PPE', details: ['PPE'] },
      { name: 'MIDLIFE', details: ['MIDLIFE'] },
      { name: 'OVERHAUL', details: ['OVERHAUL'] },
      { name: 'PCR', details: ['PCR'] },
      { name: 'UCR', details: ['UCR'] },
      { name: 'FILTER CUTTING', details: ['FILTER CUTTING'] },
      { name: 'MAGNETIC PLUG', details: ['MAGNETIC PLUG'] },
      { name: 'MAGNETIC STRAINER', details: ['MAGNETIC STRAINER'] },
      { name: 'CYLINDER RATING', details: ['CYLINDER RATING'] },
      { name: 'FLUSHING SYSTEM', details: ['FLUSHING SYSTEM'] },
      { name: 'WASHING', details: ['WASHING'] },
      { name: 'GREASING', details: ['GREASING'] },
    ],
  },
];

export function getComponentNames(): string[] {
  return COMPONENT_HIERARCHY.map((c) => c.name);
}

export function getSubComponentNames(componentName: string): string[] {
  const found = COMPONENT_HIERARCHY.find(
    (c) => c.name.toLowerCase() === componentName.trim().toLowerCase()
  );
  return found ? found.subComponents.map((s) => s.name) : [];
}

export function getDetailSubComponentNames(
  componentName: string,
  subComponentName: string
): string[] {
  const comp = COMPONENT_HIERARCHY.find(
    (c) => c.name.toLowerCase() === componentName.trim().toLowerCase()
  );
  if (!comp) return [];
  const sub = comp.subComponents.find(
    (s) => s.name.toLowerCase() === subComponentName.trim().toLowerCase()
  );
  return sub ? sub.details : [];
}
