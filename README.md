<div align="center">
  <img src="https://media.githubusercontent.com/media/little-samo/CI/master/assets/characters/samo/profile.png" alt="Little Samo Mascot" width="250" />
  <h1>SamoAI</h1>
  <p><em>A multi-agent orchestrator that helps humans and AI communicate and collaborate naturally</em></p>
</div>

<p align="center">
  <a href="#what-is-samoai">What is SamoAI</a> •
  <a href="#core-concepts">Core Concepts</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#examples">Examples</a> •
  <a href="#contact">Contact</a> •
  <a href="#license">License</a>
</p>

## What is SamoAI

SamoAI is a multi-agent orchestrator that enables you to compose modular AI agents and facilitates non-blocking collaboration between these agents and humans. Through our modular architecture, you can build AI agents by assembling components like LLMs, prompts, and tools, creating a seamless collaborative environment where multiple agents and users can work together naturally.

## Core Concepts

<div align="center">
  <img src="https://media.githubusercontent.com/media/little-samo/CI/master/assets/projects/samo-ai/diagrams/how_it_works.png" alt="SamoAI Architecture Overview" width="800" />
</div>

### Modular Agent Architecture
Our agents are built using a modular approach where LLMs, prompts, tools, and other components can be assembled like building blocks. This modularity allows for flexible agent creation tailored to specific needs and use cases.

### Non-blocking Multi-Agent Collaboration

<div align="center">
  <img src="https://media.githubusercontent.com/media/little-samo/CI/master/assets/services/minimo/team_browser.png" alt="Non-blocking Chat Example" width="300" />
</div>

Unlike traditional AI interactions where you send a message and wait for a response (blocking), SamoAI enables agents and users to engage in natural, non-blocking conversations. This means you can chat freely with multiple agents simultaneously, just like in any regular chat application, without waiting for responses.

### Memory-Driven Agents
Agents maintain memory both within teams (called Locations in our codebase) and across different teams. This memory system enables agents to understand context, build relationships, and maintain consistency in their interactions.

### Seamless Context Preservation
Agents can maintain context seamlessly across different teams and environments. Through our memory system combined with continuous summarization, agents can work organically within teams while fostering emergent behaviors and capabilities.

## Getting Started

```bash
# Using npm
npm install --save @little-samo/samo-ai

# Using yarn
yarn add @little-samo/samo-ai
```

### Environment Configuration

To enable debug mode, set `process.env.DEBUG` to `'True'`:

- Set environment variable: `DEBUG=True node your-app.js`
- Or use dotenv package with `DEBUG=True` in `.env` file

## Examples

### CLI Application

Check out our example CLI application:

[SamoAI-Example-CLI](https://github.com/little-samo/SamoAI-Example-CLI) - A command-line interface for interacting with SamoAI agents.

<div align="center">
  <img src="https://media.githubusercontent.com/media/little-samo/CI/master/assets/projects/samo-ai/examples/web.gif" alt="SamoAI Example CLI Demo" width="600" />
</div>

### [Minimo](https://minimo.team/)

<div align="center">
  <img src="https://media.githubusercontent.com/media/little-samo/CI/master/assets/services/minimo/frame.png" alt="Minimo - Meet your personalized Instant Workforce" width="600" />
</div>

**The easiest way to use our framework in all aspects**

Minimo demonstrates SamoAI's capabilities through a user-friendly platform where you can create and interact with teams of AI agents, each with unique personalities and different underlying models, enabling natural non-blocking collaboration between humans and AI.

## Contact

- **Email**: hi@littlesamo.io
- **Website**: https://littlesamo.io
- **Twitter**: https://x.com/little_samo
- **LinkedIn**: https://www.linkedin.com/company/little-samo

## License

[MIT License](LICENSE)

---

<div align="center">
  <p>Made with ❤️ by the SamoAI Team</p>
</div>
