# Zephyr Boards

**Watch an AI agent build and manage a task board in real time** — powered by [Zephyr Framework](https://github.com/daltlc/zephyr-framework).

<!-- TODO: Add live demo link once deployed -->
<!-- [Live Demo](https://zephyr-agent-demo.vercel.app) -->

<!-- TODO: Add GIF/video of the agent creating tasks in real time -->

## How It Works

1. You type a natural language request in the chat widget (e.g., *"Create 5 tasks for a product launch"*)
2. The AI agent calls Zephyr tools (`zephyr_act`, `zephyr_get_state`, etc.) to interact with the board
3. Components update in real time — cards appear, move between columns, modals open, themes switch

No custom prompt engineering. The `<z-board>` custom element registers its actions into Zephyr's agent system, so the AI discovers them automatically through the standard MCP tools.

## Architecture

```
Browser                          Server                    Anthropic
┌──────────────────┐      ┌──────────────────┐      ┌──────────────┐
│  <z-agent>       │─────▶│  /api/chat       │─────▶│  Claude API  │
│  chat widget     │◀─────│  (Vercel fn)     │◀─────│              │
│                  │      └──────────────────┘      └──────────────┘
│  Zephyr.agent    │
│  ├── getState()  │  ← Agent discovers components
│  ├── describe()  │  ← Agent inspects a component
│  ├── act()       │  ← Agent performs actions
│  └── setState()  │  ← Agent sets attributes
│                  │
│  <z-board>       │
│  ├── addTask     │  ← Custom actions registered
│  ├── moveTask    │    into Zephyr.agent._actions
│  ├── deleteTask  │
│  ├── editTask    │
│  └── clearBoard  │
└──────────────────┘
```

## Try It Locally

```bash
git clone https://github.com/daltlc/zephyr-agent-demo.git
cd zephyr-agent-demo

# Add your Anthropic API key
cp .env.example .env
# Edit .env and add your key

# Run with Vercel dev (handles the serverless proxy)
npx vercel dev
```

Open [http://localhost:3000](http://localhost:3000) and start chatting with the agent.

**No API key?** You can still explore the board UI — drag and drop tasks, switch themes, click cards for details. The agent chat just won't respond without a valid key.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdaltoncarr%2Fzephyr-agent-demo&env=ANTHROPIC_API_KEY&envDescription=Your%20Anthropic%20API%20key%20for%20the%20chat%20agent&project-name=zephyr-boards)

Set `ANTHROPIC_API_KEY` in your Vercel environment variables.

## What the Agent Can Do

| Prompt | What Happens |
|--------|-------------|
| "Create 5 tasks for a product launch" | Cards appear across columns with titles, priorities, and assignees |
| "Move 'Design review' to Done" | Card slides to the Done column |
| "Show me details for 'Ship v2'" | Modal opens with task info |
| "Show only high priority tasks" | Priority filter updates |
| "Switch to dark mode" | Theme flips instantly |
| "Clear the board and plan a sprint" | Board resets, then new cards are created |

## Built With

- [Zephyr Framework](https://github.com/daltlc/zephyr-framework) — the first UI framework built for AI agents
- Zero build step, zero bundler, zero runtime JS for interactions
- `<z-agent>` chat widget with Anthropic Claude integration
- Vercel serverless function for API key proxy

## License

MIT
