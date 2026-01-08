#!/usr/bin/env node
/**
 * Demo: Create and execute a physics notebook using the Operation Router
 *
 * This demonstrates the full workflow with history tracking:
 * 1. Create an empty notebook
 * 2. Insert cells via operation router (logs to history)
 * 3. Execute cells and update outputs via operation router (logs to history)
 *
 * All operations are routed through /api/notebook/operation, which:
 * - Routes to UI if connected (live updates)
 * - Falls back to headless mode if not
 * - Logs all operations to history (same as user interactions)
 */

import { NebulaClient } from './dist/notebook/client.js';

const NOTEBOOK_PATH = '/tmp/double-pendulum-chaos.ipynb';

// Cell definitions for the physics demo
const CELLS = [
  {
    id: 'intro',
    type: 'markdown',
    content: '# Double Pendulum: Chaos in Classical Mechanics\n\nThe double pendulum is a simple mechanical system that exhibits chaotic behavior. Small changes in initial conditions lead to dramatically different trajectories - a hallmark of chaos theory.'
  },
  {
    id: 'imports',
    type: 'code',
    content: `import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import odeint

# Physical constants
g = 9.81  # gravity (m/s^2)
L1, L2 = 1.0, 1.0  # pendulum lengths (m)
m1, m2 = 1.0, 1.0  # pendulum masses (kg)

print("✓ Constants defined: g={}, L1={}, L2={}, m1={}, m2={}".format(g, L1, L2, m1, m2))`
  },
  {
    id: 'equations',
    type: 'code',
    content: `def double_pendulum_equations(y, t, L1, L2, m1, m2, g):
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

print("✓ Equations of motion defined (Lagrangian mechanics)")`
  },
  {
    id: 'simulate',
    type: 'code',
    content: `# Simulate TWO pendulums with slightly different initial conditions
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
print("  Initial difference: 0.1 radians ({:.1f}°)".format(0.1 * 180/np.pi))`
  },
  {
    id: 'cartesian',
    type: 'code',
    content: `# Convert to Cartesian coordinates for plotting
def get_positions(sol, L1, L2):
    theta1, theta2 = sol[:, 0], sol[:, 2]
    x1 = L1 * np.sin(theta1)
    y1 = -L1 * np.cos(theta1)
    x2 = x1 + L2 * np.sin(theta2)
    y2 = y1 - L2 * np.cos(theta2)
    return x1, y1, x2, y2

x1_1, y1_1, x2_1, y2_1 = get_positions(sol1, L1, L2)
x1_2, y1_2, x2_2, y2_2 = get_positions(sol2, L1, L2)

print("✓ Converted to Cartesian coordinates")`
  },
  {
    id: 'plot',
    type: 'code',
    content: `# Plot the trajectories of the second mass (tip of pendulum)
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
plt.show()`
  },
  {
    id: 'conclusion',
    type: 'markdown',
    content: '## What We Learned\n\n1. **Deterministic ≠ Predictable**: The double pendulum follows exact physical laws, yet is practically unpredictable\n2. **Sensitive Dependence**: Initial conditions differing by just 5.7° lead to completely different trajectories\n3. **Lyapunov Exponent**: The exponential divergence rate characterizes the "strength" of chaos\n\n*"Does the flap of a butterfly\'s wings in Brazil set off a tornado in Texas?"* - Edward Lorenz'
  }
];

async function main() {
  const client = new NebulaClient({ baseUrl: process.env.NEBULA_URL || 'http://localhost:4000' });

  console.log('🔬 Double Pendulum Chaos Simulation Demo (with History Tracking)\n');
  console.log('='.repeat(60));

  // Step 1: Check if notebook exists and clear it, or create new
  console.log('\n📓 Checking notebook state...');
  let notebookExists = false;
  let existingCellCount = 0;

  try {
    const notebookResult = await client.readNotebook(NOTEBOOK_PATH);
    if (notebookResult.success) {
      notebookExists = true;
      existingCellCount = notebookResult.data.cells.length;
      console.log(`  Found existing notebook with ${existingCellCount} cells`);
    }
  } catch (e) {
    // Notebook doesn't exist yet
  }

  // Clear existing cells if notebook has content
  if (notebookExists && existingCellCount > 0) {
    console.log('\n🧹 Clearing notebook...');
    const clearResult = await client.clearNotebook(NOTEBOOK_PATH);
    if (clearResult.success) {
      console.log(`  ✓ Cleared ${clearResult.data.deletedCount} cells`);
    } else {
      console.error('  Failed to clear notebook:', clearResult.error);
    }
  }

  // Create notebook if it doesn't exist
  if (!notebookExists) {
    console.log('\n📓 Creating notebook via operation router...');
    const createResult = await client.createNotebookOp(NOTEBOOK_PATH, {
      overwrite: true,
      kernelName: 'python3',
      kernelDisplayName: 'Python 3'
    });
    if (!createResult.success) {
      console.error('Failed to create notebook:', createResult.error);
      return;
    }
    console.log('✓ Notebook created at', NOTEBOOK_PATH, '(mtime:', createResult.data?.mtime, ')');
  }

  // Step 2: Start kernel (associated with notebook for UI reconnection)
  console.log('\n🔧 Starting Python kernel...');
  const kernelResult = await client.getOrCreateKernelForFile(NOTEBOOK_PATH, 'python3');
  if (!kernelResult.success) {
    console.error('Failed to start kernel:', kernelResult.error);
    return;
  }
  const sessionId = kernelResult.data.sessionId;
  console.log('✓ Kernel started:', sessionId);

  // Step 3: Insert cells via operation router (this logs to history!)
  // Note: Small delay between inserts to avoid race conditions in operation router
  console.log('\n📝 Inserting cells via operation router (history tracked)...');
  for (let i = 0; i < CELLS.length; i++) {
    const cell = CELLS[i];
    const result = await client.insertCellOp(NOTEBOOK_PATH, i, {
      id: cell.id,
      type: cell.type,
      content: cell.content
    });

    if (result.success) {
      console.log(`  ✓ Inserted cell ${i}: ${cell.id} (${cell.type})`);
    } else {
      console.error(`  ✗ Failed to insert cell ${i}:`, result.error);
    }
    // Small delay to ensure operation router processes sequentially
    await new Promise(r => setTimeout(r, 100));
  }

  // Step 4: Execute code cells and update outputs via operation router
  console.log('\n▶️  Executing cells and updating outputs (history tracked)...\n');
  let executionCount = 0;

  for (let i = 0; i < CELLS.length; i++) {
    const cell = CELLS[i];

    if (cell.type === 'code') {
      console.log(`--- Cell ${i}: ${cell.id} ---`);
      const execResult = await client.executeCodeStreaming(sessionId, cell.content, 60000);

      if (execResult.success && execResult.data) {
        executionCount++;
        const outputs = execResult.data.outputs || [];

        // Update outputs via operation router (logs to history!)
        const updateResult = await client.updateOutputsOp(
          NOTEBOOK_PATH,
          cell.id,
          outputs,
          executionCount
        );

        if (updateResult.success) {
          // Print outputs
          for (const output of outputs) {
            if (output.type === 'stdout') {
              console.log(output.content);
            } else if (output.type === 'error') {
              console.error('Error:', output.content.split('\n').slice(-3).join('\n'));
            } else if (output.type === 'image') {
              console.log('[Image output generated]');
            }
          }
        } else {
          console.error('  Failed to update outputs:', updateResult.error);
        }
      } else {
        console.error('  Execution failed:', execResult.error);
      }
      console.log('');
    } else {
      console.log(`--- Cell ${i}: ${cell.id} (${cell.type}) ---`);
      console.log(cell.content.substring(0, 60) + '...\n');
    }
  }

  // Step 5: Done - kernel stays running
  console.log('='.repeat(60));
  console.log('✅ Demo complete!');
  console.log('   Notebook: ' + NOTEBOOK_PATH);
  console.log('   Plot: /tmp/double_pendulum_chaos.png');
  console.log('   Kernel: ' + sessionId + ' (still running)');
  console.log('\n📜 All operations logged to history via operation router!');
  console.log('   Open in Nebula UI - you can undo/redo these AI operations.');
}

main().catch(console.error);
