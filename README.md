# InsightBoard



> **Development data, made legible.** A live, responsive analytics dashboard that turns public World Development Indicators into an understandable country-comparison view.
> 


## Why this project exists



InsightBoard is a portfolio project by **Sarmad Ilyas** that demonstrates practical data-analysis and product-design skills. Rather than visualising fabricated data, it requests current published observations from the World Bank Indicators API and makes the reporting year visible beside each figure.



The initial comparison covers Pakistan, India and Bangladesh across GDP, GDP growth, population, unemployment and internet use.



## What it demonstrates



| Capability | How InsightBoard shows it |

| --- | --- |

| Data analysis | Normalises public time-series responses, identifies the latest reported observation, and calculates transparent series change. |

| Dashboard design | Uses KPI cards, responsive SVG trends, benchmark bars and a detail table to support scanning and comparison. |

| Front-end engineering | A lightweight, dependency-free ES module application with accessible controls, loading state, live refresh and API-failure recovery. |

| Responsible data use | Includes source attribution, indicator definitions, observation years and a clear statement that InsightBoard does not estimate missing values. |



## Run locally



```bash

npx serve .

```



## Data source



The project requests data through the [World Bank Indicators API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation). No API key is required for the selected public endpoints.



| Indicator | API code |

| --- | --- |

| GDP (current US$) | `NY.GDP.MKTP.CD` |

| GDP growth (annual %) | `NY.GDP.MKTP.KD.ZG` |

| Population, total | `SP.POP.TOTL` |

| Unemployment, total (% of labour force) | `SL.UEM.TOTL.ZS` |

| Individuals using the Internet (% of population) | `IT.NET.USER.ZS` |



## Verification



```bash

npm run check

npm run build

```



InsightBoard uses plain HTML, CSS and JavaScript. The check command validates JavaScript syntax and metric helpers; the build command creates the deploy-ready static `dist/` folder.



## License



MIT — see the World Bank terms and conditions for the underlying public data.


