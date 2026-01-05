#!/usr/bin/env node
/**
 * Demo: Create and execute a physics notebook using the MCP tools
 *
 * This demonstrates the full workflow:
 * 1. Create a notebook with physics simulation cells
 * 2. Start a kernel
 * 3. Execute cells to run a double pendulum chaos simulation
 */

import { NebulaClient } from './dist/notebook/client.js';

const NOTEBOOK_PATH = '/tmp/double-pendulum-chaos.ipynb';

async function main() {
  const client = new NebulaClient({ baseUrl: 'http://localhost:8000' });

  console.log('🔬 Double Pendulum Chaos Simulation Demo\n');
  console.log('=' .repeat(50));

  // Step 1: Create the notebook with physics cells
  console.log('\n📓 Creating notebook with physics simulation...');

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' }
    },
    cells: [
      {
        cell_type: 'markdown',
        source: '# Double Pendulum: Chaos in Classical Mechanics\n\nThe double pendulum is a simple mechanical system that exhibits chaotic behavior. Small changes in initial conditions lead to dramatically different trajectories - a hallmark of chaos theory.',
        metadata: {}
      },
      {
        cell_type: 'code',
        source: `import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import odeint

# Physical constants
g = 9.81  # gravity (m/s^2)
L1, L2 = 1.0, 1.0  # pendulum lengths (m)
m1, m2 = 1.0, 1.0  # pendulum masses (kg)

print("✓ Constants defined: g={}, L1={}, L2={}, m1={}, m2={}".format(g, L1, L2, m1, m2))`,
        metadata: {},
        outputs: [],
        execution_count: null
      },
      {
        cell_type: 'code',
        source: `def double_pendulum_equations(y, t, L1, L2, m1, m2, g):
    """
    Equations of motion for the double pendulum.
    y = [theta1, omega1, theta2, omega2]
    """
    theta1, omega1, theta2, omega2 = y

    delta = theta2 - theta1
    den1 = (m1 + m2) * L1 - m2 * L1 * np.cos(delta) ** 2
    den2 = (L2 / L1) * den1

    dydt = np.zeros(4)
    dydt[0] = omega1
    dydt[1] = ((m2 * L1 * omega1 ** 2 * np.sin(delta) * np.cos(delta)
                + m2 * g * np.sin(theta2) * np.cos(delta)
                + m2 * L2 * omega2 ** 2 * np.sin(delta)
                - (m1 + m2) * g * np.sin(theta1)) / den1)
    dydt[2] = omega2
    dydt[3] = ((-m2 * L2 * omega2 ** 2 * np.sin(delta) * np.cos(delta)
                + (m1 + m2) * g * np.sin(theta1) * np.cos(delta)
                - (m1 + m2) * L1 * omega1 ** 2 * np.sin(delta)
                - (m1 + m2) * g * np.sin(theta2)) / den2)

    return dydt

print("✓ Equations of motion defined (Lagrangian mechanics)")`,
        metadata: {},
        outputs: [],
        execution_count: null
      },
      {
        cell_type: 'code',
        source: `# Simulate TWO pendulums with slightly different initial conditions
# This demonstrates sensitive dependence on initial conditions (chaos!)

t = np.linspace(0, 20, 1000)

# Pendulum 1: Initial angles
theta1_0, theta2_0 = np.pi/2, np.pi/2
y0_1 = [theta1_0, 0, theta2_0, 0]

# Pendulum 2: Slightly different (0.1 radian difference)
y0_2 = [theta1_0 + 0.1, 0, theta2_0, 0]

# Solve the ODEs
sol1 = odeint(double_pendulum_equations, y0_1, t, args=(L1, L2, m1, m2, g))
sol2 = odeint(double_pendulum_equations, y0_2, t, args=(L1, L2, m1, m2, g))

print("✓ Simulated {} time steps for two pendulums".format(len(t)))
print("  Initial difference: 0.1 radians ({:.1f}°)".format(0.1 * 180/np.pi))`,
        metadata: {},
        outputs: [],
        execution_count: null
      },
      {
        cell_type: 'code',
        source: `# Convert to Cartesian coordinates for plotting
def get_positions(sol, L1, L2):
    theta1, theta2 = sol[:, 0], sol[:, 2]
    x1 = L1 * np.sin(theta1)
    y1 = -L1 * np.cos(theta1)
    x2 = x1 + L2 * np.sin(theta2)
    y2 = y1 - L2 * np.cos(theta2)
    return x1, y1, x2, y2

x1_1, y1_1, x2_1, y2_1 = get_positions(sol1, L1, L2)
x1_2, y1_2, x2_2, y2_2 = get_positions(sol2, L1, L2)

print("✓ Converted to Cartesian coordinates")`,
        metadata: {},
        outputs: [],
        execution_count: null
      },
      {
        cell_type: 'code',
        source: `# Plot the trajectories of the second mass (tip of pendulum)
fig, axes = plt.subplots(1, 2, figsize=(14, 6))

# Left: Trajectory comparison
ax1 = axes[0]
ax1.plot(x2_1, y2_1, 'b-', alpha=0.7, linewidth=0.5, label='Pendulum 1')
ax1.plot(x2_2, y2_2, 'r-', alpha=0.7, linewidth=0.5, label='Pendulum 2 (+0.1 rad)')
ax1.set_xlabel('x (m)')
ax1.set_ylabel('y (m)')
ax1.set_title('Chaos: Tiny Initial Difference → Wildly Different Paths')
ax1.legend()
ax1.set_aspect('equal')
ax1.grid(True, alpha=0.3)

# Right: Divergence over time
ax2 = axes[1]
divergence = np.sqrt((x2_1 - x2_2)**2 + (y2_1 - y2_2)**2)
ax2.semilogy(t, divergence, 'purple', linewidth=1)
ax2.set_xlabel('Time (s)')
ax2.set_ylabel('Distance between tips (m)')
ax2.set_title('Exponential Divergence (Lyapunov Instability)')
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('/tmp/double_pendulum_chaos.png', dpi=150, bbox_inches='tight')
print("✓ Plot saved to /tmp/double_pendulum_chaos.png")
print("\\n🎯 KEY INSIGHT: A tiny 0.1 radian difference grows exponentially!")
print("   This is the 'butterfly effect' - hallmark of chaotic systems.")
plt.show()`,
        metadata: {},
        outputs: [],
        execution_count: null
      },
      {
        cell_type: 'markdown',
        source: '## What We Learned\n\n1. **Deterministic ≠ Predictable**: The double pendulum follows exact physical laws, yet is practically unpredictable\n2. **Sensitive Dependence**: Initial conditions differing by just 5.7° lead to completely different trajectories\n3. **Lyapunov Exponent**: The exponential divergence rate characterizes the "strength" of chaos\n\n*"Does the flap of a butterfly\'s wings in Brazil set off a tornado in Texas?"* - Edward Lorenz',
        metadata: {}
      }
    ]
  };

  // Write the notebook
  const writeResult = await client.writeFile(NOTEBOOK_PATH, JSON.stringify(notebook, null, 2));
  if (!writeResult.success) {
    console.error('Failed to create notebook:', writeResult.error);
    return;
  }
  console.log('✓ Notebook created at', NOTEBOOK_PATH);

  // Step 2: Start a kernel
  console.log('\n🔧 Starting Python kernel...');
  const kernelResult = await client.startKernel('python3');
  if (!kernelResult.success) {
    console.error('Failed to start kernel:', kernelResult.error);
    return;
  }
  const sessionId = kernelResult.data.sessionId;
  console.log('✓ Kernel started:', sessionId);

  // Step 3: Read the notebook and execute each code cell
  console.log('\n▶️  Executing cells...\n');
  const notebookResult = await client.readNotebook(NOTEBOOK_PATH);
  if (!notebookResult.success) {
    console.error('Failed to read notebook:', notebookResult.error);
    return;
  }

  const notebookData = notebookResult.data;
  let executionCount = 0;

  for (let i = 0; i < notebookData.cells.length; i++) {
    const cell = notebookData.cells[i];

    if (cell.type === 'code') {
      console.log(`--- Cell ${i} (code) ---`);
      const execResult = await client.executeCodeStreaming(sessionId, cell.content, 60000);

      if (execResult.success) {
        executionCount++;
        // Update the cell with execution results
        cell.executionCount = executionCount;
        cell.outputs = execResult.data.outputs || [];

        for (const output of cell.outputs) {
          if (output.type === 'stdout') {
            console.log(output.content);
          } else if (output.type === 'error') {
            console.error('Error:', output.content.split('\n').slice(-3).join('\n'));
          } else if (output.type === 'image') {
            console.log('[Image output generated]');
          }
        }
      }
      console.log('');
    } else {
      console.log(`--- Cell ${i} (${cell.type}) ---`);
      console.log(cell.content.substring(0, 80) + '...\n');
    }
  }

  // Step 4: Save the notebook with outputs
  console.log('💾 Saving notebook with outputs...');
  const saveResult = await client.writeNotebook(notebookData);
  if (saveResult.success) {
    console.log('✓ Notebook saved with execution outputs');
  } else {
    console.error('Failed to save notebook:', saveResult.error);
  }

  // Step 5: Cleanup
  console.log('🧹 Shutting down kernel...');
  await client.shutdownKernel(sessionId);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Demo complete!');
  console.log('   Notebook: ' + NOTEBOOK_PATH);
  console.log('   Plot: /tmp/double_pendulum_chaos.png');
  console.log('\n   Open the notebook in Nebula to see the full visualization!');
}

main().catch(console.error);
